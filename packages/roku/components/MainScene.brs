' What the channel is doing, and drawing it.
'   setup:   choose the game, how many players and the rules; OK opens a table
'   lobby:   the table's QR code and short code while the phones sit down; OK deals
'   playing: the game as the room sees it, drawn from the server's screen (tv.ts, TvScreen)

sub init()
  m.c = Colors()
  m.content = m.top.findNode("content")
  m.toast = m.top.findNode("toast")
  SetFont(m.toast, 36, false)
  m.toastBack = m.top.findNode("toastBack")
  m.toastTimer = m.top.findNode("toastTimer")
  m.toastTimer.observeField("fire", "hideToast")

  m.server = loadServer()
  m.games = []
  m.row = 0          ' which row of the first screen has the focus
  m.gameAt = 0
  m.seats = 4
  m.rulesAt = 0
  m.table = invalid  ' { id, token } once a table is open
  m.last = invalid   ' the last answer about the table
  m.req = invalid
  m.follower = invalid
  m.mode = "setup"

  if m.server = "" then
    drawSetup()
    askServer()
  else
    loadGames()
  end if
end sub

' ---------------------------------------------------------------------------------------------
' The parlor's address: kept on the Roku, changed with * on the first screen.

function loadServer() as string
  sec = CreateObject("roRegistrySection", "parlor")
  if sec.Exists("server") then return sec.Read("server")
  return DefaultServer()
end function

sub saveServer(address as string)
  a = address.Trim()
  if a = "" then return
  ' A bare address is https: a host on the internet sends http on to https, and a POST loses its
  ' body on the way. Type http:// for a parlor on a laptop on the wifi.
  if LCase(Left(a, 4)) <> "http" then a = "https://" + a
  while Right(a, 1) = "/"
    a = Left(a, Len(a) - 1)
  end while
  m.server = a
  sec = CreateObject("roRegistrySection", "parlor")
  sec.Write("server", a)
  sec.Flush()
end sub

sub askServer()
  d = CreateObject("roSGNode", "KeyboardDialog")
  d.title = "Where is the parlor?"
  d.message = "The address phones open it at, like 192.168.1.20:8787 or parlor.example.com"
  d.text = m.server
  d.buttons = ["Save", "Cancel"]
  d.observeField("buttonSelected", "onServerDialog")
  m.top.dialog = d
end sub

sub onServerDialog()
  d = m.top.dialog
  if d.buttonSelected = 0 then
    saveServer(d.text)
    d.close = true
    loadGames()
  else
    d.close = true
  end if
end sub

' ---------------------------------------------------------------------------------------------
' Talking to the parlor.

sub request(method as string, path as string, body as object, handler as string)
  t = CreateObject("roSGNode", "ParlorTask")
  t.method = method
  t.url = m.server + path
  if body <> invalid then t.body = FormatJson(body) else t.body = ""
  t.observeField("result", handler)
  m.req = t
  t.control = "RUN"
end sub

sub loadGames()
  drawSetup()
  request("GET", "/tv/games", invalid, "onGames")
end sub

sub onGames(event as object)
  r = event.getData()
  if r.status <> 200 or r.json = invalid then
    showToast("Couldn't reach the parlor at " + m.server + ". Press * to change the address.")
    return
  end if
  m.games = r.json.games
  if m.gameAt >= m.games.Count() then m.gameAt = 0
  if m.games.Count() > 0 then m.seats = m.games[m.gameAt].seats.default
  drawSetup()
end sub

sub openTable()
  if m.games.Count() = 0 then return
  g = m.games[m.gameAt]
  ' Said in the address as well as the body: the address survives a redirect, the body may not.
  query = "?game=" + g.id + "&seats=" + Str(m.seats).Trim() + "&rules=" + g.rules[m.rulesAt].id
  request("POST", "/tv/tables" + query, { game: g.id, seats: m.seats, rules: g.rules[m.rulesAt].id }, "onOpened")
  showToast("Opening a table…")
end sub

sub onOpened(event as object)
  r = event.getData()
  if r.status <> 201 then
    showToast(errorOf(r))
    return
  end if
  hideToast()
  m.table = { id: r.json.id, token: r.json.token }
  m.last = invalid
  m.mode = "lobby"
  drawLobby(invalid)
  startFollowing()
end sub

sub startFollowing()
  stopFollowing()
  f = CreateObject("roSGNode", "ParlorTask")
  f.mode = "follow"
  f.url = m.server + "/tv/tables/" + m.table.id + "?token=" + m.table.token
  f.observeField("result", "onTable")
  m.follower = f
  f.control = "RUN"
end sub

sub stopFollowing()
  if m.follower <> invalid then
    m.follower.halt = true
    m.follower.unobserveField("result")
    m.follower = invalid
  end if
end sub

sub onTable(event as object)
  r = event.getData()
  if r.status <> 200 or r.json = invalid then
    showToast("Lost the parlor for a moment. Trying again…")
    return
  end if
  m.last = r.json
  if r.json.closed <> invalid then
    showToast("This table was closed: " + r.json.closed)
  end if
  if r.json.started then
    m.mode = "playing"
    drawGame(r.json.screen)
  else
    m.mode = "lobby"
    drawLobby(r.json)
  end if
end sub

sub deal()
  if m.table = invalid then return
  request("POST", "/tv/tables/" + m.table.id + "/start?fill=1&token=" + m.table.token, { token: m.table.token, fill: true }, "onDealt")
end sub

sub onDealt(event as object)
  r = event.getData()
  if r.status <> 200 then showToast(errorOf(r))
end sub

function errorOf(r as object) as string
  if r.error <> invalid and r.error <> "" then return r.error
  return "Something went wrong (" + Str(r.status).Trim() + ")."
end function

' ---------------------------------------------------------------------------------------------
' The remote.

function onKeyEvent(key as string, press as boolean) as boolean
  if not press then return false
  if m.mode = "setup" then return setupKey(key)
  if key = "back" then
    ' The table carries on for the phones; the television goes back to choosing.
    stopFollowing()
    m.table = invalid
    m.mode = "setup"
    hideToast()
    drawSetup()
    return true
  end if
  if m.mode = "lobby" and (key = "OK" or key = "play") then
    deal()
    return true
  end if
  return false
end function

function setupKey(key as string) as boolean
  if key = "options" then
    askServer()
    return true
  end if
  if m.games.Count() = 0 then
    if key = "OK" then loadGames()
    return key = "OK"
  end if
  g = m.games[m.gameAt]
  if key = "up" then
    if m.row > 0 then m.row = m.row - 1
  else if key = "down" then
    if m.row < 3 then m.row = m.row + 1
  else if key = "left" or key = "right" then
    d = 1
    if key = "left" then d = -1
    if m.row = 0 then
      m.gameAt = (m.gameAt + d + m.games.Count()) mod m.games.Count()
      m.seats = m.games[m.gameAt].seats.default
      m.rulesAt = 0
    else if m.row = 1 then
      n = m.seats + d
      if n >= g.seats.min and n <= g.seats.max then m.seats = n
    else if m.row = 2 then
      m.rulesAt = (m.rulesAt + d + g.rules.Count()) mod g.rules.Count()
    end if
  else if key = "OK" or key = "play" then
    openTable()
    return true
  else
    return false
  end if
  drawSetup()
  return true
end function

' ---------------------------------------------------------------------------------------------
' Messages along the bottom.

sub showToast(text as string)
  m.toast.text = text
  m.toast.visible = true
  m.toastBack.visible = true
  m.toastTimer.control = "stop"
  m.toastTimer.control = "start"
end sub

sub hideToast()
  m.toast.visible = false
  m.toastBack.visible = false
end sub

' ---------------------------------------------------------------------------------------------
' The first screen.

sub drawSetup()
  c = m.c
  ClearGroup(m.content)
  AddLabel(m.content, "open.parlor", 120, 70, 1200, 110, 88, true, c.gold, "left")
  AddLabel(m.content, "The TV is the table. Everyone's phone is their controller.", 120, 180, 1680, 60, 40, false, c.ink, "left")

  if m.games.Count() = 0 then
    AddLabel(m.content, "Looking for the parlor…", 120, 420, 1680, 80, 48, false, c.dim, "left")
  else
    g = m.games[m.gameAt]
    rows = [
      ["Game", g.name],
      ["Players", Str(m.seats).Trim()],
      ["Rules", g.rules[m.rulesAt].name],
    ]
    y = 320
    for i = 0 to 2
      bg = c.card
      if m.row = i then bg = c.cardHi
      AddRect(m.content, 120, y, 1100, 120, bg)
      AddLabel(m.content, rows[i][0], 160, y, 300, 120, 36, false, c.dim, "left")
      arrows = rows[i][1]
      if m.row = i then arrows = "‹  " + rows[i][1] + "  ›"
      AddLabel(m.content, arrows, 460, y, 720, 120, 52, true, c.ink, "left")
      y = y + 140
    end for
    bg = c.card
    ink = c.gold
    if m.row = 3 then
      bg = c.gold
      ink = c.shadow
    end if
    AddRect(m.content, 120, y + 20, 1100, 130, bg)
    AddLabel(m.content, "Open the table", 120, y + 20, 1100, 130, 56, true, ink, "center")

    AddLabel(m.content, "How it goes", 1320, 320, 480, 60, 40, true, c.gold, "left")
    AddLabel(m.content, "1. Open the table here." + Chr(10) + "2. Everyone scans the code with their phone." + Chr(10) + "3. Answer on your phone. The room's answer shows up here.", 1320, 380, 480, 400, 34, false, c.ink, "left")
  end if

  AddLabel(m.content, "Parlor: " + m.server + "     * to change", 120, 960, 1680, 50, 28, false, c.dim, "left")
end sub

' ---------------------------------------------------------------------------------------------
' Waiting for the phones.

sub drawLobby(t as dynamic)
  c = m.c
  ClearGroup(m.content)
  if t = invalid then
    AddLabel(m.content, "Opening a table…", 120, 460, 1680, 120, 60, true, c.ink, "center")
    return
  end if
  s = t.screen
  AddLabel(m.content, s.title, 120, 60, 1680, 100, 72, true, c.gold, "left")

  ' The code a phone's camera reads, on white so any camera sees it.
  AddRect(m.content, 120, 200, 640, 640, "0xFFFFFFFF")
  AddPoster(m.content, m.server + "/tv/tables/" + m.table.id + "/qr.png", 130, 210, 620, 620)
  AddLabel(m.content, "Point your phone's camera here", 120, 850, 640, 60, 32, false, c.ink, "center")

  AddLabel(m.content, "or go to", 860, 200, 940, 50, 34, false, c.dim, "left")
  AddLabel(m.content, t.host + "/tv/", 860, 250, 940, 60, 44, false, c.ink, "left")
  AddLabel(m.content, t.code, 860, 310, 940, 150, 140, true, c.gold, "left")

  ' Who has sat down.
  n = s.players.Count()
  cols = 2
  if n <= 4 then cols = 1
  w = Int(940 / cols)
  for i = 0 to n - 1
    p = s.players[i]
    x = 860 + (i mod cols) * w
    y = 500 + Int(i / cols) * 80
    if p.name <> "" then
      AddRect(m.content, x, y + 10, 50, 50, c.done)
      AddLabel(m.content, Initial(p.name), x, y + 10, 50, 50, 30, true, c.shadow, "center")
      AddLabel(m.content, p.name, x + 70, y, w - 80, 70, 38, true, c.ink, "left")
    else
      AddRect(m.content, x, y + 10, 50, 50, c.card)
      AddLabel(m.content, "open seat", x + 70, y, w - 80, 70, 34, false, c.dim, "left")
    end if
  end for

  joined = n - t.free
  hint = "Waiting for the first player to join"
  if joined > 0 and t.free = 0 then hint = "Everyone's in.  Press OK to start."
  if joined > 0 and t.free > 0 then
    word = " seats"
    if t.free = 1 then word = " seat"
    hint = "Press OK to start. The computer plays the " + Str(t.free).Trim() + " empty" + word + "."
  end if
  AddLabel(m.content, hint, 860, 880, 1000, 90, 34, true, c.gold, "left")
  AddLabel(m.content, "Back: choose another game", 860, 960, 1000, 50, 28, false, c.dim, "left")
end sub

' ---------------------------------------------------------------------------------------------
' The game, as the room sees it.

sub drawGame(s as object)
  ClearGroup(m.content)
  if s.layout = "question" then
    drawQuestion(s)
  else if s.layout = "room" then
    drawRoom(s)
  else if s.layout = "over" then
    drawOver(s)
  else
    drawScores(s)
  end if
end sub

sub drawQuestion(s as object)
  c = m.c
  AddLabel(m.content, s.count, 120, 60, 1680, 60, 40, true, c.gold, "left")
  AddLabel(m.content, s.question, 160, 170, 1600, 520, 84, true, c.ink, "center")
  AddLabel(m.content, "Answer on your phone", 120, 700, 1680, 60, 36, false, c.dim, "center")
  drawSeats(s.players, 800)
end sub

' A row of everyone at the table: a round with their initial, their name, and whether they're in.
sub drawSeats(players as object, y as integer)
  c = m.c
  n = players.Count()
  if n = 0 then return
  w = Int(1680 / n)
  for i = 0 to n - 1
    p = players[i]
    x = 120 + i * w
    fill = c.card
    status = "Thinking…"
    if p.done then
      fill = c.done
      status = "In"
    end if
    AddRect(m.content, x + Int(w / 2) - 50, y, 100, 100, fill)
    AddLabel(m.content, Initial(p.name), x + Int(w / 2) - 50, y, 100, 100, 52, true, c.ink, "center")
    AddLabel(m.content, p.name, x, y + 110, w, 50, 32, true, c.ink, "center")
    AddLabel(m.content, status, x, y + 155, w, 40, 26, false, c.dim, "center")
  end for
end sub

sub drawRoom(s as object)
  c = m.c
  AddLabel(m.content, s.count + "   ·   " + s.question, 120, 50, 1680, 80, 34, false, c.dim, "left")
  AddLabel(m.content, s.headline, 120, 130, 1680, 110, 72, true, c.gold, "left")

  ' What the room said: a bar for each answer.
  bars = s.bars
  shown = bars.Count()
  if shown > 7 then shown = 7
  rowH = 86
  maxV = s.max
  if maxV < 1 then maxV = 1
  for i = 0 to shown - 1
    b = bars[i]
    y = 280 + i * rowH
    ink = c.ink
    fill = c.bar
    if b.best then
      ink = c.gold
      fill = c.gold
    end if
    AddLabel(m.content, b.label, 120, y, 460, rowH - 10, 36, b.best, ink, "right")
    w = Int(800 * b.value / maxV)
    if w < 6 then w = 6
    AddRect(m.content, 610, y + 14, w, rowH - 38, fill)
    AddLabel(m.content, Str(b.value).Trim() + s.unit, 620 + w, y, 300, rowH - 10, 34, true, ink, "left")
  end for

  ' What it was worth to each player, and where they stand.
  AddLabel(m.content, "This round", 1500, 280, 300, 50, 30, true, c.dim, "left")
  y = 340
  for each p in s.players
    gained = ""
    if p.gained > 0 then gained = "+" + Str(p.gained).Trim()
    AddLabel(m.content, p.name, 1500, y, 220, 50, 32, false, c.ink, "left")
    AddLabel(m.content, gained, 1700, y, 120, 50, 32, true, c.gold, "right")
    y = y + 56
  end for
  AddLabel(m.content, "Tap Next on your phone when you're ready", 120, 950, 1680, 50, 30, false, c.dim, "center")
end sub

sub drawOver(s as object)
  c = m.c
  AddLabel(m.content, s.title, 120, 80, 1680, 140, 96, true, c.gold, "center")
  ranked = sortedByScore(s.players)
  y = 280
  place = 1
  for i = 0 to ranked.Count() - 1
    p = ranked[i]
    if i > 0 and p.score < ranked[i - 1].score then place = i + 1
    size = 44
    ink = c.ink
    if place = 1 then
      size = 60
      ink = c.gold
    end if
    AddLabel(m.content, Str(place).Trim() + ".", 460, y, 100, 80, size, true, ink, "right")
    AddLabel(m.content, p.name, 600, y, 600, 80, size, true, ink, "left")
    AddLabel(m.content, Str(p.score).Trim(), 1200, y, 260, 80, size, true, ink, "right")
    y = y + 90
  end for
  AddLabel(m.content, "Back: play another", 120, 960, 1680, 50, 30, false, c.dim, "center")
end sub

' Any other game: who's playing and the score, until it has a board of its own here.
sub drawScores(s as object)
  c = m.c
  AddLabel(m.content, s.title, 120, 60, 1680, 100, 72, true, c.gold, "left")
  AddLabel(m.content, s.count, 120, 160, 1680, 60, 36, false, c.dim, "left")
  y = 260
  for each p in s.players
    AddLabel(m.content, p.name, 160, y, 900, 70, 44, true, c.ink, "left")
    AddLabel(m.content, Str(p.score).Trim(), 1100, y, 300, 70, 44, true, c.gold, "right")
    y = y + 80
  end for
  AddLabel(m.content, s.narration, 120, 900, 1680, 60, 34, false, c.ink, "left")
end sub

function sortedByScore(players as object) as object
  out = []
  for each p in players
    out.Push(p)
  end for
  ' A handful of players: a plain insertion sort, highest first.
  for i = 1 to out.Count() - 1
    j = i
    while j > 0
      if out[j].score <= out[j - 1].score then exit while
      t = out[j]
      out[j] = out[j - 1]
      out[j - 1] = t
      j = j - 1
    end while
  end for
  return out
end function
