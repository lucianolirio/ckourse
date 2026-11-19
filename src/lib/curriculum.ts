import type { Section } from "@/types";

/**
 * Importers name the sections of a two-level course folder "Module — Topic"
 * (see `parser.rs`, Pattern 3). The curriculum panel splits that back into a
 * module header and its topics, so the module name shows once instead of
 * being repeated, and truncated, on every row.
 */
export const MODULE_SEPARATOR = " — ";

export interface SectionTitleParts {
  module: string;
  topic: string;
}

/** Splits "Module — Topic" on the first separator; null when the title has none. */
export function splitSectionTitle(title: string): SectionTitleParts | null {
  const cut = title.indexOf(MODULE_SEPARATOR);
  if (cut < 0) return null;
  const module = title.slice(0, cut).trim();
  const topic = title.slice(cut + MODULE_SEPARATOR.length).trim();
  if (!module || !topic) return null;
  return { module, topic };
}

/** "Module › Topic" for display; the title as-is when it has no module part. */
export function formatSectionPath(title: string): string {
  const parts = splitSectionTitle(title);
  if (!parts) return title;
  return parts.topic === parts.module ? parts.module : `${parts.module} › ${parts.topic}`;
}

export interface CurriculumTopic {
  section: Section;
  /** The topic's own name, without the module prefix. Null when it adds nothing to the module name. */
  title: string | null;
  /** "1.2": module number, then the topic's place in it. */
  number: string;
}

export interface CurriculumModule {
  key: string;
  title: string;
  /** "01" */
  number: string;
  topics: CurriculumTopic[];
}

/**
 * Groups consecutive sections that share a module name. Returns null when no
 * section follows the "Module — Topic" pattern, so those courses keep the
 * plain section list. A section without the pattern inside a grouped course
 * becomes a single-topic module of its own.
 */
export function groupCurriculum(sections: Section[]): CurriculumModule[] | null {
  const parts = sections.map((s) => splitSectionTitle(s.title));
  if (!parts.some(Boolean)) return null;

  const modules: { title: string; sections: { section: Section; topic: string }[] }[] = [];
  sections.forEach((section, i) => {
    const moduleTitle = parts[i]?.module ?? section.title;
    const topic = parts[i]?.topic ?? section.title;
    const last = modules[modules.length - 1];
    if (last && last.title === moduleTitle) {
      last.sections.push({ section, topic });
    } else {
      modules.push({ title: moduleTitle, sections: [{ section, topic }] });
    }
  });

  return modules.map((m, i) => {
    const n = i + 1;
    return {
      key: `module-${m.sections[0].section.id}`,
      title: m.title,
      number: String(n).padStart(2, "0"),
      topics: m.sections.map(({ section, topic }, j) => ({
        section,
        title: topic === m.title ? null : topic,
        number: `${n}.${j + 1}`,
      })),
    };
  });
}
