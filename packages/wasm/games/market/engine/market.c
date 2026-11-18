/*
 * Delbie's Stockroom: the sim under the game.
 *
 * Forty-eight parts on eight shelves; wholesale prices that drift, weather and supplier news that
 * push them, customers who buy what is on the shelf at the shelf price, rats that chew the stock,
 * and the rent every seventh day. Twenty-eight days, then the books are counted.
 *
 * Everything here is integers: money is cents, fractions are per-mille, and there is no libc and no
 * floating point. So a game is exactly a seed and the commands given on each tic, on any machine,
 * and `state_hash` says whether two runs agree. The page never asks the module for a number one at
 * a time: the state sits in a few fixed tables (see the enums) that the page reads in place.
 *
 * A "tic" is a tenth of an hour. Names for the parts, their shelves and their words are the
 * page's (src/market/catalog.ts); the numbers behind them are here.
 */
#include <stdint.h>

#define EXPORT(name) __attribute__((export_name(name)))

enum {
  N_PARTS = 48,
  N_CATS = 8,
  TICS_PER_HOUR = 10,
  TICS_PER_DAY = 240,
  DAYS = 28,
  RENT_EVERY = 7,
  HIST = 48,    /* wholesale prices kept per part, one an hour */
  EVENTS = 128, /* things that happened, kept for the page to read */
  ORDERS = 256, /* orders on the truck at once */
};

/* The rules, in cents and units. */
enum {
  START_CASH = 450000,
  RENT = 150000,
  SHELF = 420, /* units the store can hold, counting what is on the truck */
  TRAP_COST = 6000,
  MAX_TRAPS = 20,
  FAIR_PERCENT = 150, /* the price customers think is fair: this much of the usual wholesale */
  DEMAND_PERCENT = 10, /* how much of the table's demand there is: tunes how hard the game is */
  LEAD_TICS = 120,     /* the truck takes half a day */
};

/* G: the whole store, one number each. */
enum {
  G_PHASE, /* 0 open, 1 the month is over, 2 couldn't pay the rent */
  G_TIC,
  G_DAY,
  G_HOUR,
  G_CASH,
  G_TEMP, /* degrees Fahrenheit */
  G_REP,  /* 0 to 1000 */
  G_RATS, /* 0 to 1000 */
  G_TRAPS,
  G_RENT_DAY, /* the day rent is next taken */
  G_UNITS_TODAY,
  G_REVENUE_TODAY,
  G_MISSED_TODAY,
  G_REVENUE,
  G_MISSED,
  G_SPENT,    /* cash that went on stock */
  G_STOCK,    /* units on the shelves */
  G_INBOUND,  /* units on the truck */
  G_WORTH,    /* cash and the stock at today's wholesale prices */
  G_HIST_N,   /* hourly samples taken so far */
  G_EV_HEAD,  /* events written so far */
  G_SHIFT,    /* degrees the weather is pushed off its usual */
  G_SHIFT_LEFT,
  G_REP_ACC,
  G_COUNT
};

/* P: one row a part. The first four columns never change. */
enum {
  P_CAT,
  P_BASE,   /* the usual wholesale price */
  P_FAIR,   /* what customers think a fair price is */
  P_RATE,   /* tenths of a unit a day, before the weather and the rest */
  P_COST,   /* wholesale now */
  P_PRICE,  /* on the shelf */
  P_STOCK,
  P_INBOUND,
  P_SOLD_TODAY,
  P_SOLD,
  P_MISSED,
  P_AUTO_BELOW, /* order more when stock and truck fall below this... */
  P_AUTO_TO,    /* ...up to this (0: off) */
  P_DEMAND,     /* how much the customers want it now, per-mille of the usual */
  P_COUNT
};

/* The page's commands. */
enum { C_BUY = 1, C_PRICE = 2, C_AUTO = 3, C_MARKUP = 4, C_TRAP = 5 };
/* What a command says back. */
enum { R_OK = 0, R_NO_CASH = 1, R_BAD = 2, R_NO_ROOM = 3, R_OVER = 4 };
/* The events. */
enum {
  E_DAY = 1,       /* a = the day that ended, b = what it took */
  E_SOLD_OUT = 2,  /* a = part */
  E_DELIVERED = 3, /* a = part, b = units */
  E_RATS = 4,      /* a = part, b = units chewed */
  E_COLD = 5,      /* a = degrees */
  E_STRIKE = 6,    /* a = shelf, b = percent up */
  E_SALE = 7,      /* a = shelf, b = percent down */
  E_RAIN = 8,      /* a = shelf, b = percent more wanted */
  E_RENT = 9,      /* a = paid */
  E_END = 10,      /* a = phase */
  E_AUTO = 11,     /* a = part, b = units ordered by the standing order */
  E_TRAP = 12,     /* a = rats left (per-mille) */
};

typedef struct {
  uint8_t cat;
  int16_t base; /* cents */
  int16_t rate; /* tenths a day */
  int8_t vol;   /* how jumpy the price is, per-mille a tic */
} Def;

/* Cold and hot: per-mille more wanted for each degree under 40 and over 80. */
static const int16_t COLD[N_CATS] = {0, 0, 10, 35, 20, 0, 25, 15};
static const int16_t HOT[N_CATS] = {0, 0, 20, 0, 0, 0, 0, 0};

static const Def DEFS[N_PARTS] = {
    /* filters */
    {0, 450, 420, 4}, {0, 700, 260, 4}, {0, 1100, 300, 5}, {0, 1300, 180, 5}, {0, 1500, 90, 6}, {0, 2900, 40, 6},
    /* brakes */
    {1, 2800, 120, 6}, {1, 2400, 90, 6}, {1, 3600, 70, 7}, {1, 3000, 50, 7}, {1, 5800, 25, 8}, {1, 1200, 35, 6},
    /* belts and hoses */
    {2, 1900, 90, 5}, {2, 8500, 20, 8}, {2, 1800, 40, 5}, {2, 2000, 35, 5}, {2, 450, 80, 4}, {2, 3600, 25, 6},
    /* batteries */
    {3, 7900, 45, 8}, {3, 9600, 55, 8}, {3, 12900, 30, 9}, {3, 14900, 25, 9}, {3, 600, 90, 4}, {3, 9900, 12, 9},
    /* starters and alternators */
    {4, 11900, 18, 10}, {4, 12900, 18, 10}, {4, 2400, 20, 7}, {4, 2900, 12, 7}, {4, 2200, 80, 5}, {4, 3400, 45, 6},
    /* exhaust */
    {5, 5400, 30, 8}, {5, 21900, 10, 12}, {5, 3200, 20, 7}, {5, 4400, 35, 8}, {5, 450, 100, 4}, {5, 1500, 40, 5},
    /* fluids */
    {6, 2100, 250, 4}, {6, 1300, 150, 5}, {6, 350, 200, 4}, {6, 600, 90, 4}, {6, 800, 110, 4}, {6, 500, 70, 4},
    /* wipers and lights */
    {7, 800, 220, 4}, {7, 900, 180, 4}, {7, 1500, 160, 5}, {7, 400, 120, 4}, {7, 700, 100, 4}, {7, 2800, 40, 6},
};

static int32_t G[G_COUNT];
static int32_t P[N_PARTS][P_COUNT];
static int32_t H[N_PARTS][HIST];
static int32_t EV[EVENTS][4]; /* kind, a, b, tic */
static int32_t ORD[ORDERS][3]; /* part, units, arrives */
static int32_t COST_CC[N_PARTS]; /* wholesale in hundredths of a cent: the price moves in steps smaller than a cent */
static int32_t ACC[N_PARTS];     /* customers on the way, in millionths */
static int32_t SHOCK[N_CATS];    /* per-mille of the usual wholesale price a shelf is being pushed to */
static int32_t SHOCK_LEFT[N_CATS];
static int32_t BOOST[N_CATS];    /* per-mille of the usual demand */
static int32_t BOOST_LEFT[N_CATS];
static uint32_t SEED_STATE;

static uint32_t next(void) {
  uint32_t x = SEED_STATE;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  return SEED_STATE = x;
}
static int32_t rnd(int32_t n) { return (int32_t)(next() % (uint32_t)n); }
static int32_t atleast(int32_t v, int32_t floor) { return v < floor ? floor : v; }
static int32_t atmost(int32_t v, int32_t ceil) { return v > ceil ? ceil : v; }

static void event(int32_t kind, int32_t a, int32_t b) {
  int32_t *e = EV[G[G_EV_HEAD] % EVENTS];
  e[0] = kind;
  e[1] = a;
  e[2] = b;
  e[3] = G[G_TIC];
  G[G_EV_HEAD]++;
}

/* The price a shelf rounds to: the nearest five cents, never nothing. */
static int32_t round5(int32_t cents) { return atleast((cents + 2) / 5 * 5, 5); }

static void count(void) {
  int32_t stock = 0, inbound = 0, worth = G[G_CASH];
  for (int i = 0; i < N_PARTS; i++) {
    stock += P[i][P_STOCK];
    inbound += P[i][P_INBOUND];
    worth += P[i][P_STOCK] * P[i][P_COST];
  }
  G[G_STOCK] = stock;
  G[G_INBOUND] = inbound;
  G[G_WORTH] = worth;
}

EXPORT("init")
void init(uint32_t seed) {
  SEED_STATE = seed ? seed : 1;
  for (int i = 0; i < G_COUNT; i++) G[i] = 0;
  for (int i = 0; i < EVENTS; i++) for (int k = 0; k < 4; k++) EV[i][k] = 0;
  for (int i = 0; i < ORDERS; i++) for (int k = 0; k < 3; k++) ORD[i][k] = 0;
  for (int c = 0; c < N_CATS; c++) {
    SHOCK[c] = BOOST[c] = 1000;
    SHOCK_LEFT[c] = BOOST_LEFT[c] = 0;
  }
  G[G_CASH] = START_CASH;
  G[G_TEMP] = 52;
  G[G_REP] = 800;
  G[G_RENT_DAY] = RENT_EVERY - 1;
  for (int i = 0; i < N_PARTS; i++) {
    const Def *d = &DEFS[i];
    for (int k = 0; k < P_COUNT; k++) P[i][k] = 0;
    P[i][P_CAT] = d->cat;
    P[i][P_BASE] = d->base;
    P[i][P_FAIR] = round5(d->base * FAIR_PERCENT / 100);
    P[i][P_RATE] = d->rate;
    P[i][P_COST] = d->base;
    P[i][P_PRICE] = P[i][P_FAIR];
    /* A shelf that sells a lot opens with more on it. */
    P[i][P_STOCK] = 2 + d->rate / 30;
    P[i][P_DEMAND] = 1000;
    COST_CC[i] = d->base * 100;
    ACC[i] = 0;
    for (int h = 0; h < HIST; h++) H[i][h] = d->base;
  }
  G[G_HIST_N] = HIST;
  count();
}

/* How much the weather, the day of the week and the news want of a shelf, per-mille. */
static int32_t want(int c) {
  int32_t temp = G[G_TEMP];
  int32_t m = 1000 + atleast(40 - temp, 0) * COLD[c] + atleast(temp - 80, 0) * HOT[c];
  m = m * BOOST[c] / 1000;
  if (G[G_DAY] % 7 >= 5) m = m * 5 / 4;
  return m;
}

static int32_t lead(int c) { return LEAD_TICS + (SHOCK_LEFT[c] > 0 && SHOCK[c] > 1000 ? LEAD_TICS : 0); }

static int32_t room(void) { return SHELF - G[G_STOCK] - G[G_INBOUND]; }

/* Puts an order on the truck and pays for it. The caller has checked there is cash and room. */
static int32_t order(int part, int32_t units) {
  for (int s = 0; s < ORDERS; s++) {
    if (ORD[s][1] > 0) continue;
    int32_t cost = P[part][P_COST];
    ORD[s][0] = part;
    ORD[s][1] = units;
    ORD[s][2] = G[G_TIC] + lead(P[part][P_CAT]);
    P[part][P_INBOUND] += units;
    G[G_INBOUND] += units;
    G[G_CASH] -= units * cost;
    G[G_SPENT] += units * cost;
    return R_OK;
  }
  return R_NO_ROOM;
}

EXPORT("command")
int32_t command(int32_t kind, int32_t a, int32_t b) {
  if (G[G_PHASE]) return R_OVER;
  switch (kind) {
    case C_BUY: {
      if (a < 0 || a >= N_PARTS || b < 1 || b > 999) return R_BAD;
      if (b > room()) return R_NO_ROOM;
      if (b * P[a][P_COST] > G[G_CASH]) return R_NO_CASH;
      return order(a, b);
    }
    case C_PRICE:
      if (a < 0 || a >= N_PARTS || b < 1 || b > 99999) return R_BAD;
      P[a][P_PRICE] = b;
      return R_OK;
    case C_AUTO:
      /* a = part; b = below + 1000 * to */
      if (a < 0 || a >= N_PARTS) return R_BAD;
      {
        int32_t below = b % 1000, to = b / 1000;
        if (below < 0 || to < 0 || to > 99 || below > to) return R_BAD;
        P[a][P_AUTO_BELOW] = below;
        P[a][P_AUTO_TO] = to;
      }
      return R_OK;
    case C_MARKUP:
      /* a = shelf; b = percent of the usual wholesale price */
      if (a < 0 || a >= N_CATS || b < 100 || b > 400) return R_BAD;
      for (int i = 0; i < N_PARTS; i++) if (P[i][P_CAT] == a) P[i][P_PRICE] = round5(P[i][P_BASE] * b / 100);
      return R_OK;
    case C_TRAP:
      if (G[G_TRAPS] >= MAX_TRAPS) return R_NO_ROOM;
      if (TRAP_COST > G[G_CASH]) return R_NO_CASH;
      G[G_CASH] -= TRAP_COST;
      G[G_TRAPS]++;
      return R_OK;
  }
  return R_BAD;
}

static void hourly(void) {
  G[G_HOUR] = G[G_TIC] % TICS_PER_DAY / TICS_PER_HOUR;
  /* The weather leans towards a colder day each day, and wanders. */
  int32_t usual = 52 - G[G_DAY] * 8 / 10 + G[G_SHIFT];
  G[G_TEMP] += (usual - G[G_TEMP]) / 6 + rnd(5) - 2;

  for (int i = 0; i < N_PARTS; i++) H[i][G[G_HIST_N] % HIST] = P[i][P_COST];
  G[G_HIST_N]++;

  /* News. */
  if (rnd(90) == 0) {
    int32_t kind = rnd(4), c = rnd(N_CATS);
    if (kind == 0 && G[G_SHIFT_LEFT] == 0) {
      G[G_SHIFT] = -20;
      G[G_SHIFT_LEFT] = 3;
      event(E_COLD, -20, 0);
    } else if (kind == 1 && SHOCK_LEFT[c] == 0) {
      int32_t up = 25 + rnd(21);
      SHOCK[c] = 1000 + up * 10;
      SHOCK_LEFT[c] = 3 + rnd(2);
      event(E_STRIKE, c, up);
    } else if (kind == 2 && SHOCK_LEFT[c] == 0) {
      int32_t down = 12 + rnd(9);
      SHOCK[c] = 1000 - down * 10;
      SHOCK_LEFT[c] = 2;
      event(E_SALE, c, down);
    } else if (kind == 3 && BOOST_LEFT[7] == 0) {
      BOOST[7] = 1600;
      BOOST_LEFT[7] = 2;
      event(E_RAIN, 7, 60);
    }
  }

  /* Standing orders. */
  for (int i = 0; i < N_PARTS; i++) {
    int32_t to = P[i][P_AUTO_TO];
    if (!to || P[i][P_STOCK] + P[i][P_INBOUND] >= P[i][P_AUTO_BELOW]) continue;
    int32_t units = to - P[i][P_STOCK] - P[i][P_INBOUND];
    units = atmost(units, room());
    units = atmost(units, G[G_CASH] / P[i][P_COST]);
    if (units > 0 && order(i, units) == R_OK) event(E_AUTO, i, units);
  }
  count();
}

static void night(void) {
  int32_t day = G[G_DAY];
  event(E_DAY, day, G[G_REVENUE_TODAY]);

  /* The rats grow, the traps thin them, and what is left chews. */
  int32_t before = G[G_RATS];
  G[G_RATS] = atmost(atleast(G[G_RATS] + 50 - G[G_TRAPS] * 30, 0), 1000);
  if (G[G_TRAPS] && G[G_RATS] < before) event(E_TRAP, G[G_RATS], 0);
  for (int k = G[G_RATS] / 150; k > 0; k--) {
    int part = rnd(N_PARTS);
    int32_t units = atmost(1 + rnd(3), P[part][P_STOCK]);
    if (units <= 0) continue;
    P[part][P_STOCK] -= units;
    event(E_RATS, part, units);
  }

  for (int c = 0; c < N_CATS; c++) {
    if (SHOCK_LEFT[c] > 0 && --SHOCK_LEFT[c] == 0) SHOCK[c] = 1000;
    if (BOOST_LEFT[c] > 0 && --BOOST_LEFT[c] == 0) BOOST[c] = 1000;
  }
  if (G[G_SHIFT_LEFT] > 0 && --G[G_SHIFT_LEFT] == 0) G[G_SHIFT] = 0;
  if (!G[G_MISSED_TODAY]) G[G_REP] = atmost(G[G_REP] + 5, 1000);

  G[G_UNITS_TODAY] = G[G_REVENUE_TODAY] = G[G_MISSED_TODAY] = 0;
  for (int i = 0; i < N_PARTS; i++) P[i][P_SOLD_TODAY] = 0;

  if (day == G[G_RENT_DAY]) {
    G[G_RENT_DAY] += RENT_EVERY;
    if (G[G_CASH] < RENT) {
      G[G_PHASE] = 2;
    } else {
      G[G_CASH] -= RENT;
      event(E_RENT, RENT, 0);
    }
  }
  G[G_DAY]++;
  if (!G[G_PHASE] && G[G_DAY] >= DAYS) G[G_PHASE] = 1;
  count();
  if (G[G_PHASE]) event(E_END, G[G_PHASE], G[G_WORTH]);
}

static void tic(void) {
  int32_t now = G[G_TIC];
  if (now % TICS_PER_HOUR == 0) hourly();

  for (int i = 0; i < N_PARTS; i++) {
    int32_t usual = DEFS[i].base * 100;
    int32_t target = usual / 1000 * SHOCK[DEFS[i].cat] + usual % 1000 * SHOCK[DEFS[i].cat] / 1000;
    int32_t cc = COST_CC[i];
    cc += (target - cc) / 400;
    cc += cc / 1000 * (rnd(2 * DEFS[i].vol + 1) - DEFS[i].vol);
    cc = atmost(atleast(cc, target / 2), target * 2);
    COST_CC[i] = cc;
    P[i][P_COST] = (cc + 50) / 100;
  }

  for (int s = 0; s < ORDERS; s++) {
    if (ORD[s][1] <= 0 || ORD[s][2] > now) continue;
    int part = ORD[s][0], units = ORD[s][1];
    ORD[s][1] = 0;
    P[part][P_INBOUND] -= units;
    P[part][P_STOCK] += units;
    G[G_INBOUND] -= units;
    G[G_STOCK] += units;
    event(E_DELIVERED, part, units);
  }

  for (int i = 0; i < N_PARTS; i++) {
    int32_t *p = P[i];
    int32_t m = want(p[P_CAT]) * (600 + G[G_REP] / 2) / 1000;
    /* Customers want less the further the price climbs over what they think fair, and more the further it falls under. */
    int32_t r = p[P_PRICE] * 1000 / p[P_FAIR];
    int32_t pf = atmost(atleast(1000 - (r - 1000) * 22 / 10, 0), 2800);
    p[P_DEMAND] = m * pf / 1000;
    int64_t numerator = (int64_t)p[P_RATE] * DEMAND_PERCENT * m * pf * (700 + rnd(601));
    ACC[i] += (int32_t)(numerator / 240000000LL);
    if (ACC[i] < 1000000) continue;

    int32_t wanted = ACC[i] / 1000000;
    ACC[i] %= 1000000;
    int32_t sold = atmost(wanted, p[P_STOCK]);
    int32_t missed = wanted - sold;
    if (sold) {
      p[P_STOCK] -= sold;
      p[P_SOLD_TODAY] += sold;
      p[P_SOLD] += sold;
      G[G_STOCK] -= sold;
      G[G_CASH] += sold * p[P_PRICE];
      G[G_REVENUE] += sold * p[P_PRICE];
      G[G_REVENUE_TODAY] += sold * p[P_PRICE];
      G[G_UNITS_TODAY] += sold;
      G[G_REP_ACC] += sold;
      for (; G[G_REP_ACC] >= 4; G[G_REP_ACC] -= 4) G[G_REP] = atmost(G[G_REP] + 1, 1000);
      if (!p[P_STOCK]) event(E_SOLD_OUT, i, 0);
    }
    if (missed) {
      p[P_MISSED] += missed;
      G[G_MISSED] += missed;
      G[G_MISSED_TODAY] += missed;
      G[G_REP] = atleast(G[G_REP] - 3 * missed, 0);
    }
  }

  G[G_TIC] = ++now;
  if (now % TICS_PER_DAY == 0) night();
}

/* Runs up to `n` tics, stopping when the month ends. Says what phase it is in. */
EXPORT("step")
int32_t step(int32_t n) {
  while (n-- > 0 && !G[G_PHASE]) tic();
  return G[G_PHASE];
}

/* A number that is the same for any two runs that have come to the same place. */
EXPORT("state_hash")
uint32_t state_hash(void) {
  uint32_t h = 2166136261u;
#define MIX(table, words)                                         \
  for (const int32_t *w = (const int32_t *)(table), *e = w + (words); w < e; w++) { \
    h ^= (uint32_t)*w;                                            \
    h *= 16777619u;                                               \
  }
  MIX(G, G_COUNT)
  MIX(P, N_PARTS * P_COUNT)
  MIX(H, N_PARTS * HIST)
  MIX(EV, EVENTS * 4)
  MIX(ORD, ORDERS * 3)
  MIX(COST_CC, N_PARTS)
  MIX(ACC, N_PARTS)
  MIX(SHOCK, N_CATS)
  MIX(SHOCK_LEFT, N_CATS)
  MIX(BOOST, N_CATS)
  MIX(BOOST_LEFT, N_CATS)
  h ^= SEED_STATE;
  h *= 16777619u;
  return h;
}

/* Where the tables are, for the page to read in place. The module's memory never grows. */
EXPORT("globals") int32_t globals(void) { return (int32_t)(uintptr_t)G; }
EXPORT("parts") int32_t parts(void) { return (int32_t)(uintptr_t)P; }
EXPORT("history") int32_t history(void) { return (int32_t)(uintptr_t)H; }
EXPORT("events") int32_t events(void) { return (int32_t)(uintptr_t)EV; }

/* The shapes of the tables, which the page checks against its own idea of them. */
EXPORT("shape")
int32_t shape(int32_t which) {
  switch (which) {
    case 0: return N_PARTS;
    case 1: return N_CATS;
    case 2: return P_COUNT;
    case 3: return G_COUNT;
    case 4: return HIST;
    case 5: return EVENTS;
    case 6: return TICS_PER_DAY;
    case 7: return DAYS;
    case 8: return SHELF;
    case 9: return RENT;
    case 10: return START_CASH;
    case 11: return TRAP_COST;
    case 12: return TICS_PER_HOUR;
    case 13: return RENT_EVERY;
    case 14: return DEMAND_PERCENT;
  }
  return -1;
}
