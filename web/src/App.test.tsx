import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import App from "./App";
import { api } from "./api";

vi.mock("./api", () => ({ api: vi.fn() }));

describe("App authentication gate", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.className = "";
  });

  it("keeps the practice app hidden until the session is authenticated", async () => {
    vi.mocked(api).mockResolvedValue({ authenticated: false });

    render(<App />);

    expect(screen.getByText("접속 확인 중...")).toBeInTheDocument();
    expect(await screen.findByLabelText("비밀번호")).toBeInTheDocument();
    expect(screen.queryByText("연습")).not.toBeInTheDocument();
  });

  it("switches between the five primary trainer surfaces", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/auth/session") return { authenticated: true };
      if (path === "/health") return { ok: true };
      if (path === "/settings") return {};
      if (path === "/categories") return [];
      return [];
    });

    render(<App />);

    const navigation = await screen.findByRole("navigation", {
      name: "주요 화면 전환",
    });
    expect(navigation.querySelectorAll("button")).toHaveLength(5);

    fireEvent.click(screen.getByRole("button", { name: "설정" }));

    expect(
      await screen.findByRole("heading", { name: "설정" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "설정" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("stores the chosen theme and sends the resolved theme to Android", async () => {
    const setTheme = vi.fn();
    Object.defineProperty(window, "opictAndroid", {
      configurable: true,
      value: { requestMicrophonePermission: vi.fn(), setTheme },
    });
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/auth/session") return { authenticated: true };
      if (path === "/health") return { ok: true };
      if (path === "/settings") return {};
      if (path === "/categories") return [];
      return [];
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "설정" }));
    fireEvent.change(await screen.findByLabelText("테마"), {
      target: { value: "light" },
    });

    await waitFor(() => {
      expect(localStorage.getItem("opict-theme")).toBe("light");
      expect(document.documentElement).toHaveClass("light");
      expect(setTheme).toHaveBeenLastCalledWith(false);
    });

    Reflect.deleteProperty(window, "opictAndroid");
  });

  it("preserves an unfinished correction when moving between menus", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/auth/session") return { authenticated: true };
      if (path === "/health") return { ok: true };
      if (path === "/settings") return {};
      if (path === "/categories") return [];
      if (path === "/attempts" || path === "/corrections") return [];
      return [];
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "교정" }));
    fireEvent.change(await screen.findByLabelText("교정받을 영어 문장"), {
      target: { value: "I went there yesterday." },
    });

    fireEvent.click(screen.getByRole("button", { name: "노트" }));
    fireEvent.click(screen.getByRole("button", { name: "교정" }));

    expect(await screen.findByLabelText("교정받을 영어 문장")).toHaveValue(
      "I went there yesterday.",
    );
  });
});
