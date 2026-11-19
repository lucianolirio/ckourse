import { describe, expect, it } from "vitest";
import { formatSectionPath, groupCurriculum, splitSectionTitle } from "./curriculum";
import type { Section } from "@/types";

const section = (id: number, title: string): Section => ({ id, title, lessons: [] });

describe("splitSectionTitle", () => {
  it("splits on the first separator only", () => {
    expect(splitSectionTitle("Rag — Indexação — parte 2")).toEqual({
      module: "Rag",
      topic: "Indexação — parte 2",
    });
  });

  it("returns null without a separator or with an empty side", () => {
    expect(splitSectionTitle("Introdução")).toBeNull();
    expect(splitSectionTitle("Rag-Indexação")).toBeNull();
    expect(splitSectionTitle(" — Indexação")).toBeNull();
    expect(splitSectionTitle("Rag — ")).toBeNull();
  });
});

describe("formatSectionPath", () => {
  it("joins module and topic with a chevron", () => {
    expect(formatSectionPath("Python — NumPy")).toBe("Python › NumPy");
  });

  it("collapses a topic that repeats the module, and leaves plain titles alone", () => {
    expect(formatSectionPath("WorkShop — WorkShop")).toBe("WorkShop");
    expect(formatSectionPath("Introdução")).toBe("Introdução");
  });
});

describe("groupCurriculum", () => {
  it("keeps the plain list when no section uses the module pattern", () => {
    expect(groupCurriculum([section(1, "Intro"), section(2, "Setup")])).toBeNull();
    expect(groupCurriculum([])).toBeNull();
  });

  it("groups consecutive sections by module and numbers them", () => {
    const modules = groupCurriculum([
      section(10, "Python — NumPy"),
      section(11, "Python — Pandas"),
      section(20, "Rag — Fundamentos"),
    ])!;

    expect(modules.map((m) => [m.number, m.title])).toEqual([
      ["01", "Python"],
      ["02", "Rag"],
    ]);
    expect(modules[0].topics.map((t) => [t.number, t.title, t.section.id])).toEqual([
      ["1.1", "NumPy", 10],
      ["1.2", "Pandas", 11],
    ]);
    expect(modules[1].topics.map((t) => t.number)).toEqual(["2.1"]);
  });

  it("does not merge a module that comes back after another one", () => {
    const modules = groupCurriculum([
      section(1, "A — x"),
      section(2, "B — y"),
      section(3, "A — z"),
    ])!;
    expect(modules.map((m) => m.title)).toEqual(["A", "B", "A"]);
    expect(new Set(modules.map((m) => m.key)).size).toBe(3);
  });

  it("drops a topic name that only repeats the module name", () => {
    const [m] = groupCurriculum([section(1, "WorkShop — WorkShop")])!;
    expect(m.topics[0].title).toBeNull();
  });

  it("turns a plain section in a grouped course into its own module", () => {
    const modules = groupCurriculum([section(1, "Boas-vindas"), section(2, "Rag — Fundamentos")])!;
    expect(modules.map((m) => [m.number, m.title])).toEqual([
      ["01", "Boas-vindas"],
      ["02", "Rag"],
    ]);
    expect(modules[0].topics).toHaveLength(1);
    expect(modules[0].topics[0].title).toBeNull();
  });
});
