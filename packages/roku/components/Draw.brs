' Small helpers for drawing with SceneGraph nodes. Sizes are for a 1920x1080 screen.

function Colors() as object
  return {
    ink: "0xF5F0E1FF",      ' cream on felt
    dim: "0xF5F0E199",
    gold: "0xE8B64CFF",
    card: "0x1F4A2FFF",
    cardHi: "0x2E6B44FF",
    done: "0x3FA66BFF",
    bar: "0xC9D8C5FF",
    shadow: "0x0B1F13FF",
  }
end function

' A system font at any size: set the named font, then its size (Roku's own way to scale one).
sub SetFont(l as object, size, bold as boolean)
  if bold then l.font = "font:MediumBoldSystemFont" else l.font = "font:MediumSystemFont"
  l.font.size = size
end sub

' A line (or a wrapped block) of text. align: "left", "center" or "right".
function AddLabel(parent as object, text as string, x, y, w, h, size, bold as boolean, color as string, align as string) as object
  l = parent.createChild("Label")
  l.translation = [x, y]
  l.width = w
  l.height = h
  l.text = text
  l.color = color
  SetFont(l, size, bold)
  l.horizAlign = align
  l.vertAlign = "center"
  l.wrap = true
  return l
end function

function AddRect(parent as object, x, y, w, h, color as string) as object
  r = parent.createChild("Rectangle")
  r.translation = [x, y]
  r.width = w
  r.height = h
  r.color = color
  return r
end function

function AddPoster(parent as object, uri as string, x, y, w, h) as object
  p = parent.createChild("Poster")
  p.translation = [x, y]
  p.width = w
  p.height = h
  p.loadDisplayMode = "scaleToFit"
  p.uri = uri
  return p
end function

sub ClearGroup(g as object)
  n = g.getChildCount()
  if n > 0 then g.removeChildrenIndex(n, 0)
end sub

' The first letter of a name, for a player's round.
function Initial(name as string) as string
  if Len(name) = 0 then return "?"
  return UCase(Left(name, 1))
end function
