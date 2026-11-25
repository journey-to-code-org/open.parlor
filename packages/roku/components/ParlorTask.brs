sub init()
  m.top.functionName = "work"
end sub

sub work()
  if m.top.mode = "follow" then
    follow()
  else
    m.top.result = fetchJson(m.top.method, m.top.url, m.top.body, 15000)
  end if
end sub

' Follow a table: each answer is the screen as it now stands, and the next ask waits for a change.
sub follow()
  after = ""
  failures = 0
  while not m.top.halt
    url = m.top.url
    if after <> "" then url = url + "&after=" + after
    answer = fetchJson("GET", url, "", 30000)
    if m.top.halt then return
    if answer.status = 200 and answer.json <> invalid then
      failures = 0
      if answer.json.stamp <> invalid then after = answer.json.stamp
      m.top.result = answer
    else
      ' A dropped connection or a server restarting: try again, more slowly, and say so after a while.
      failures = failures + 1
      if failures >= 3 then m.top.result = answer
      sleep(1000 * failures)
      if failures > 8 then failures = 8
    end if
  end while
end sub

function fetchJson(method as string, url as string, body as string, timeoutMs as integer) as object
  port = CreateObject("roMessagePort")
  xfer = CreateObject("roUrlTransfer")
  xfer.SetMessagePort(port)
  xfer.SetUrl(url)
  xfer.SetRequest(method)
  xfer.EnableEncodings(true)
  xfer.RetainBodyOnError(true)
  if LCase(Left(url, 5)) = "https" then
    xfer.SetCertificatesFile("common:/certs/ca-bundle.crt")
    xfer.InitClientCertificates()
  end if
  xfer.AddHeader("content-type", "application/json")
  xfer.AddHeader("accept", "application/json")
  if method = "POST" then
    started = xfer.AsyncPostFromString(body)
  else
    started = xfer.AsyncGetToString()
  end if
  if not started then return { status: 0, json: invalid, error: "Couldn't reach the parlor." }
  msg = wait(timeoutMs, port)
  if type(msg) <> "roUrlEvent" then
    xfer.AsyncCancel()
    return { status: 0, json: invalid, error: "The parlor didn't answer." }
  end if
  status = msg.GetResponseCode()
  text = msg.GetString()
  parsed = invalid
  if text <> invalid and text <> "" then parsed = ParseJson(text)
  if status <= 0 then return { status: status, json: parsed, error: "Couldn't reach the parlor (" + msg.GetFailureReason() + ")." }
  errorText = ""
  if parsed <> invalid and type(parsed) = "roAssociativeArray" and parsed.error <> invalid then errorText = parsed.error
  return { status: status, json: parsed, error: errorText }
end function
