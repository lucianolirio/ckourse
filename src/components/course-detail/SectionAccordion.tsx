import { useEffect, useRef, useState } from "react";
import {
  PlayIcon as Play,
  CheckCircleIcon as CheckCircle,
  CaretDownIcon as CaretDown,
  HeartIcon as Heart,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { EASE } from "@/lib/constants";
import { formatDuration } from "@/lib/format";
import type { Section, Lesson } from "@/types";
import { ProgressRing } from "@/components/ui/progress-ring";

interface SectionAccordionProps {
  section: Section;
  activeLessonId: number | undefined;
  onSelectLesson: (lesson: Lesson) => void;
  onToggleComplete: (lessonId: number) => void;
  onToggleFavorite: (lessonId: number) => void;
  /**
   * Set when the section is a topic inside a module ("1.2"). The row then shows
   * the number before the ring, wraps its title, and turns into a card while
   * open so its lessons read as belonging to it.
   */
  number?: string;
  /** Title to show instead of `section.title` (the topic without its module name). */
  title?: string;
}

export function SectionAccordion({
  section,
  activeLessonId,
  onSelectLesson,
  onToggleComplete,
  onToggleFavorite,
  number,
  title,
}: SectionAccordionProps) {
  const isTopic = number !== undefined;
  const displayTitle = title ?? section.title;
  // Rows rendered after first paint are lessons completed during this visit
  const settled = useRef(false);
  useEffect(() => {
    settled.current = true;
  }, []);
  const completedCount = section.lessons.filter((l) => l.completed).length;
  const allComplete =
    completedCount === section.lessons.length && section.lessons.length > 0;
  const hasActiveLesson = section.lessons.some((l) => l.id === activeLessonId);
  const [open, setOpen] = useState(hasActiveLesson);

  useEffect(() => {
    setOpen(hasActiveLesson);
  }, [hasActiveLesson]);
  const sectionDuration = section.lessons.reduce(
    (sum, l) => sum + l.duration,
    0,
  );

  const sectionPct = section.lessons.length ? (completedCount / section.lessons.length) * 100 : 0;
  const status = allComplete ? (
    <CheckCircle className="size-4 shrink-0 text-primary" weight="fill" aria-label="Section complete" />
  ) : (
    <ProgressRing value={sectionPct} size={16} stroke={2.25} />
  );

  return (
    <div
      className={cn(
        isTopic ? "rounded-xl transition-colors duration-300" : "py-0.5",
        isTopic && open && "bg-card",
      )}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex w-full gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-secondary/70",
          isTopic ? "items-start" : "items-center",
        )}
      >
        {isTopic ? (
          <>
            <span
              className={cn(
                "flex h-[19px] w-[30px] shrink-0 items-center justify-center font-mono text-xs font-medium tabular-nums transition-colors",
                allComplete ? "text-primary" : "text-muted-foreground",
              )}
            >
              {number}
            </span>
            {/* Sits in the same column as the lesson status icons below it */}
            <span className="flex h-[19px] shrink-0 items-center">{status}</span>
          </>
        ) : (
          status
        )}

        <div className={cn("flex min-w-0 flex-1 flex-col", isTopic && "ml-0.5 gap-0.5")}>
          {isTopic ? (
            <span
              title={displayTitle}
              className="line-clamp-2 font-sans text-[13.5px] leading-snug font-medium text-foreground"
            >
              {displayTitle}
            </span>
          ) : (
            <span className="truncate font-sans text-[13px] font-semibold text-foreground">{displayTitle}</span>
          )}
          <span className="font-sans text-xs text-muted-foreground tabular-nums">
            {completedCount} of {section.lessons.length}
            {sectionDuration > 0 && <> · {formatDuration(sectionDuration)}</>}
          </span>
        </div>

        <CaretDown
          className={cn("size-3.5 shrink-0 text-muted-foreground", isTopic && "mt-0.5")}
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
          <div className={cn("flex flex-col gap-px", isTopic ? "px-1.5 pb-1.5" : "pt-0.5 pb-2")}>
            {section.lessons.map((lesson, index) => {
              const isActive = lesson.id === activeLessonId;

              return (
                <div
                  key={lesson.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-xl pr-2.5 transition-colors",
                    // In a topic card, the status icon lines up with the topic title
                    isTopic ? "pl-[42px]" : "pl-1.5",
                    isActive
                      ? isTopic
                        ? "bg-accent"
                        : "bg-secondary"
                      : isTopic
                        ? "hover:bg-secondary"
                        : "hover:bg-secondary/60",
                  )}
                  style={{
                    opacity: open ? 1 : 0,
                    transform: open ? "translateX(0)" : "translateX(-6px)",
                    transition: `opacity 300ms ${EASE} ${index * 30}ms, transform 300ms ${EASE} ${index * 30}ms, background-color 150ms`,
                  }}
                >
                  <button
                    onClick={() => onToggleComplete(lesson.id)}
                    aria-label={lesson.completed ? `Mark "${lesson.title}" incomplete` : `Mark "${lesson.title}" complete`}
                    aria-pressed={lesson.completed}
                    title={lesson.completed ? "Mark incomplete" : "Mark complete"}
                    className="flex size-7 shrink-0 items-center justify-center rounded-md"
                  >
                    {lesson.completed ? (
                      <CompletionCheck animate={settled.current} />
                    ) : isActive ? (
                      <div className="flex size-4 items-center justify-center">
                        <Play className="size-3.5 text-primary" weight="fill" />
                      </div>
                    ) : (
                      <LessonProgress
                        progress={lesson.duration > 0 ? lesson.lastPosition / (lesson.duration * 60) : 0}
                      />
                    )}
                  </button>

                  <button
                    onClick={() => onSelectLesson(lesson)}
                    aria-current={isActive ? "true" : undefined}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-2 pl-1 text-left"
                  >
                    <span
                      className={cn(
                        "flex-1 font-sans text-[13px] leading-snug",
                        isActive
                          ? "font-medium text-foreground"
                          : lesson.completed
                            ? "text-muted-foreground"
                            : "text-foreground",
                      )}
                    >
                      {lesson.title}
                    </span>
                    {!lesson.favorited && lesson.duration > 0 && (
                      <span className="shrink-0 font-sans text-xs text-muted-foreground tabular-nums transition-opacity group-hover:opacity-0 group-focus-within:opacity-0">
                        {formatDuration(lesson.duration)}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => onToggleFavorite(lesson.id)}
                    aria-label={lesson.favorited ? `Remove "${lesson.title}" from favorites` : `Add "${lesson.title}" to favorites`}
                    aria-pressed={lesson.favorited}
                    title={lesson.favorited ? "Remove from favorites" : "Add to favorites"}
                    className={cn(
                      "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-md transition-[opacity,color]",
                      lesson.favorited
                        ? "text-destructive hover:text-destructive/80"
                        : "-ml-6 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:text-destructive",
                    )}
                  >
                    <Heart className="size-3.5" weight={lesson.favorited ? "fill" : "regular"} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const CIRCLE_R = 6;
const CIRCLE_C = 2 * Math.PI * CIRCLE_R;

function LessonProgress({ progress }: { progress: number }) {
  const clamped = Math.min(Math.max(progress, 0), 1);
  const hasProgress = clamped > 0.01;

  return (
    <div className="relative flex size-4 items-center justify-center">
      <svg className="absolute size-4" viewBox="0 0 16 16" aria-hidden="true">
        <circle
          cx="8"
          cy="8"
          r={CIRCLE_R}
          fill="none"
          className={cn(
            "transition-colors",
            hasProgress ? "stroke-primary/20" : "stroke-input group-hover:stroke-muted-foreground",
          )}
          strokeWidth="1.5"
        />
        {hasProgress && (
          <circle
            cx="8"
            cy="8"
            r={CIRCLE_R}
            fill="none"
            className="stroke-primary"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray={CIRCLE_C}
            strokeDashoffset={CIRCLE_C * (1 - clamped)}
            transform="rotate(-90 8 8)"
          />
        )}
      </svg>
    </div>
  );
}

/**
 * The lesson checkmark. Lessons that were already done render still; one finished
 * while you watch lands with a spring, the single moment the app says "nice".
 */
function CompletionCheck({ animate }: { animate: boolean }) {
  const [earnedNow] = useState(animate);
  return (
    <CheckCircle
      className={cn("size-4 text-primary", earnedNow && "check-pop")}
      weight="fill"
    />
  );
}
