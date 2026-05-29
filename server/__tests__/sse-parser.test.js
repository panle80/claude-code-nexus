/**
 * Simulates the SSE stream parsing logic from useChat.js:187-278.
 * Extracted into a pure function for testability.
 */
function parseSSEStream(chunks) {
  const result = {
    tokens: [],
    thinking: [],
    usage: [],
    sessionId: null,
    errors: [],
    stderr: [],
    exitCode: null,
  };

  let buffer = "";
  let currentEvent = "token";
  let fullContent = "";
  let fullThinking = "";

  for (const chunk of chunks) {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;

      const eventMatch = line.match(/^event: (.+)$/);
      if (eventMatch) {
        currentEvent = eventMatch[1];
        continue;
      }

      const dataMatch = line.match(/^data: (.+)$/);
      if (dataMatch) {
        try {
          const parsed = JSON.parse(dataMatch[1]);

          switch (currentEvent) {
            case "token":
              fullContent += parsed.text;
              result.tokens.push(parsed.text);
              break;
            case "thinking":
              fullThinking += parsed.text;
              result.thinking.push(parsed.text);
              break;
            case "session":
              result.sessionId = parsed.sessionId;
              break;
            case "usage":
              result.usage.push(parsed);
              break;
            case "error":
              result.errors.push(parsed.message);
              break;
            case "stderr":
              result.stderr.push(parsed.text);
              break;
            case "done":
              result.exitCode = parsed.exitCode;
              break;
          }
        } catch {
          // skip unparseable
        }
      }
    }
  }

  result.fullContent = fullContent;
  result.fullThinking = fullThinking;
  return result;
}

describe("SSE stream parser", () => {
  it("parses token events", () => {
    const chunks = [
      'event: token\ndata: {"text":"Hello"}\n\n',
      'event: token\ndata: {"text":" world"}\n\n',
    ];
    const result = parseSSEStream(chunks);
    expect(result.tokens).toEqual(["Hello", " world"]);
    expect(result.fullContent).toBe("Hello world");
  });

  it("parses thinking events", () => {
    const chunks = [
      'event: thinking\ndata: {"text":"Let me think..."}\n\n',
    ];
    const result = parseSSEStream(chunks);
    expect(result.thinking).toEqual(["Let me think..."]);
    expect(result.fullThinking).toBe("Let me think...");
  });

  it("parses session event", () => {
    const chunks = [
      'event: session\ndata: {"sessionId":"abc123xyz"}\n\n',
    ];
    const result = parseSSEStream(chunks);
    expect(result.sessionId).toBe("abc123xyz");
  });

  it("parses usage events", () => {
    const chunks = [
      'event: usage\ndata: {"input_tokens": 150}\n\n',
      'event: usage\ndata: {"output_tokens": 80}\n\n',
    ];
    const result = parseSSEStream(chunks);
    expect(result.usage).toHaveLength(2);
    expect(result.usage[0].input_tokens).toBe(150);
    expect(result.usage[1].output_tokens).toBe(80);
  });

  it("parses done event", () => {
    const chunks = [
      'event: done\ndata: {"exitCode": 0}\n\n',
    ];
    const result = parseSSEStream(chunks);
    expect(result.exitCode).toBe(0);
  });

  it("handles error events", () => {
    const chunks = [
      'event: error\ndata: {"message":"Something went wrong"}\n\n',
    ];
    const result = parseSSEStream(chunks);
    expect(result.errors).toContain("Something went wrong");
  });

  it("handles split chunks (partial line buffering)", () => {
    // Simulate a line split across two chunks
    const chunks = [
      'event: token\ndata: {"text":"Hel',
      'lo"}\n\n',
    ];
    const result = parseSSEStream(chunks);
    expect(result.fullContent).toBe("Hello");
  });

  it("skips unparseable data lines", () => {
    const chunks = [
      'event: token\ndata: {invalid json}\n\n',
      'event: token\ndata: {"text":"ok"}\n\n',
    ];
    const result = parseSSEStream(chunks);
    expect(result.tokens).toEqual(["ok"]);
  });

  it("handles empty input", () => {
    const result = parseSSEStream([]);
    expect(result.tokens).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.exitCode).toBeNull();
  });

  it("handles mixed event types in sequence", () => {
    const chunks = [
      'event: session\ndata: {"sessionId":"sid1"}\n\n',
      'event: token\ndata: {"text":"Hi"}\n\n',
      'event: thinking\ndata: {"text":"Hmm"}\n\n',
      'event: usage\ndata: {"input_tokens":10}\n\n',
      'event: done\ndata: {"exitCode":0}\n\n',
    ];
    const result = parseSSEStream(chunks);
    expect(result.sessionId).toBe("sid1");
    expect(result.fullContent).toBe("Hi");
    expect(result.fullThinking).toBe("Hmm");
    expect(result.usage).toHaveLength(1);
    expect(result.exitCode).toBe(0);
  });

  it("handles stderr events", () => {
    const chunks = [
      'event: stderr\ndata: {"text":"Warning: something"}\n\n',
    ];
    const result = parseSSEStream(chunks);
    expect(result.stderr).toContain("Warning: something");
  });
});
