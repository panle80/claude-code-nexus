import { render, screen, fireEvent } from "@testing-library/react";
import Login from "../components/Login";

describe("Login", () => {
  it("renders login form by default", () => {
    render(<Login onEnter={() => {}} theme="dark" onToggleTheme={() => {}} />);
    expect(screen.getByPlaceholderText("用户名")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("密码")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
  });

  it("shows register fields after switching mode", () => {
    render(<Login onEnter={() => {}} theme="dark" onToggleTheme={() => {}} />);
    fireEvent.click(screen.getByText("立即注册"));
    expect(screen.getByPlaceholderText("确认密码")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "注册" })).toBeInTheDocument();
  });

  it("disables submit button when fields are empty", () => {
    render(<Login onEnter={() => {}} theme="dark" onToggleTheme={() => {}} />);
    expect(screen.getByRole("button", { name: "登录" })).toBeDisabled();
  });

  it("enables button when both fields are filled", () => {
    render(<Login onEnter={() => {}} theme="dark" onToggleTheme={() => {}} />);
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "testuser" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "test1234" } });
    expect(screen.getByRole("button", { name: "登录" })).toBeEnabled();
  });
});
