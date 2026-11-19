import { useEffect, useMemo, useState } from "react";
import { CaretDownIcon as CaretDown, CheckCircleIcon as CheckCircle } from "@phosphor-icons/react";
import { ProgressRing } from "@/components/ui/progress-ring";
import { cn } from "@/lib/utils";
import { EASE } from "@/lib/constants";
import { formatDuration } from "@/lib/format";
import { groupCurriculum, type CurriculumModule } from "@/lib/curriculum";
import type { Lesson, Section } from "@/types";
import { SectionAccordion } from "@/components/course-detail/SectionAccordion";

interface LessonActions {
  activeLessonId: number | undefined;
  onSelectLesson: (lesson: Lesson) => void;
  onToggleComplete: (lessonId: number) => void;
  onToggleFavorite: (lessonId: number) => void;
}

interface CurriculumListProps extends LessonActions {
  sections: Section[];
}

/**
 * The "Course content" list. Courses imported from two-level folders
 * ("Module — Topic" sections) get module headers with their topics nested
 * inside; every other course keeps the plain section list.
 */
export function CurriculumList({ sections, ...actions }: CurriculumListProps) {
  const modules = useMemo(() => groupCurriculum(sections), [sections]);

  if (!modules) {
    return (
      <>
        {sections.map((section) => (
          <SectionAccordion key={section.id} section={section} {...actions} />
        ))}
      </>
    );
  }

  return (
    <>
      {modules.map((module, i) => (
        <ModuleGroup key={module.key} module={module} first={i === 0} {...actions} />
      ))}
    </>
  );
}

interface ModuleGroupProps extends LessonActions {
  module: CurriculumModule;
  first: boolean;
}

function ModuleGroup({ module, first, activeLessonId, ...actions }: ModuleGroupProps) {
  const lessons = module.topics.flatMap((t) => t.section.lessons);
  const total = lessons.length;
  const done = lessons.filter((l) => l.completed).length;
  const duration = lessons.reduce((sum, l) => sum + l.duration, 0);
  const complete = total > 0 && done === total;
  const pct = total ? (done / total) * 100 : 0;
  const topicCount = module.topics.length;

  // Like topics: only the module holding the current lesson starts open, and it
  // follows the lesson when playback moves into another module.
  const hasActiveLesson = lessons.some((l) => l.id === activeLessonId);
  const [open, setOpen] = useState(hasActiveLesson);
  useEffect(() => {
    setOpen(hasActiveLesson);
  }, [hasActiveLesson]);

  return (
    <section className={cn("py-1", !first && "border-t border-border/60")}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-secondary/70"
      >
        <span
          className={cn(
            "flex size-[30px] shrink-0 items-center justify-center rounded-lg border font-mono text-xs font-semibold tabular-nums transition-colors",
            complete ? "border-primary/30 bg-primary/15 text-primary" : "border-accent bg-sidebar-accent text-foreground",
          )}
        >
          {module.number}
        </span>

        {/* Same status column as the topic rings and lesson icons */}
        <span className="flex h-[30px] shrink-0 items-center">
          {complete ? (
            <CheckCircle className="size-4 text-primary" weight="fill" aria-label="Module complete" />
          ) : (
            <ProgressRing value={pct} size={16} stroke={2.25} />
          )}
        </span>

        {/* Top padding centres the first title line on the badge */}
        <span className="ml-0.5 flex min-w-0 flex-1 flex-col gap-1.5 pt-[5px]">
          <span
            title={module.title}
            className="line-clamp-2 font-heading text-[15px] leading-snug font-semibold text-foreground"
          >
            {module.title}
          </span>
          <span className="font-sans text-xs text-muted-foreground tabular-nums">
            {topicCount} {topicCount === 1 ? "topic" : "topics"} · {done} of {total}
            {duration > 0 && <> · {formatDuration(duration)}</>}
          </span>
          <span aria-hidden="true" className="block h-[3px] overflow-hidden rounded-full bg-accent">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${pct}%`, transition: `width 500ms ${EASE}` }}
            />
          </span>
        </span>

        <CaretDown
          className="mt-2 size-3.5 shrink-0 text-muted-foreground"
          style={{
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            transition: `transform 300ms ${EASE}`,
          }}
        />
      </button>

      <div
        inert={!open}
        className="grid"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          opacity: open ? 1 : 0,
          transition: `grid-template-rows 350ms ${EASE}, opacity 250ms ${EASE}`,
        }}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-1 pb-2">
            {module.topics.map((topic) => (
              <SectionAccordion
                key={topic.section.id}
                section={topic.section}
                number={topic.number}
                title={topic.title ?? "All lessons"}
                activeLessonId={activeLessonId}
                {...actions}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
