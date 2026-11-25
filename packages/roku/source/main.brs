' open.parlor on a Roku: the television is the table, the phones in the room are the controllers.
' Everything the channel draws comes from the parlor's /tv routes (packages/server/src/tv.ts).
sub Main(args as dynamic)
  screen = CreateObject("roSGScreen")
  port = CreateObject("roMessagePort")
  screen.SetMessagePort(port)
  scene = screen.CreateScene("MainScene")
  screen.Show()
  scene.setFocus(true)
  while true
    msg = wait(0, port)
    if type(msg) = "roSGScreenEvent" and msg.IsScreenClosed() then return
  end while
end sub
