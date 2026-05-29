import { render, screen, fireEvent } from "@testing-library/react";
import ChatInput from "../components/ChatInput";

describe("ChatInput", () => {
  it("renders input and send button", () => {
    render(<ChatInput onSend={() => {}} onAbort={() => {}} isStreaming={false} />);
    expect(screen.getByPlaceholderText("向 Claude 提问...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送消息" })).toBeInTheDocument();
  });

  it("calls onSend when submitting", () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} onAbort={() => {}} isStreaming={false} />);
    const textarea = screen.getByPlaceholderText("向 Claude 提问...");
    fireEvent.change(textarea, { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));
    expect(onSend).toHaveBeenCalledWith("hello");
  });

  it("shows stop button when streaming", () => {
    render(<ChatInput onSend={() => {}} onAbort={() => {}} isStreaming />);
    expect(screen.getByRole("button", { name: "停止生成" })).toBeInTheDocument();
  });
});
