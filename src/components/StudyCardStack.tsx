import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  CheckSquare,
  CircleDot,
  Eye,
  Gauge,
  Layers,
  Pencil,
  Repeat,
  RotateCcw,
  Sparkles,
  Tag,
  Trash2,
  Zap,
} from "lucide-react";
import type { Deck, Flashcard } from "../types";
import {
  formatCardTypeLabel,
  formatEaseFactor,
  formatInterval,
  formatReviewDate,
} from "../utils/formatters";
import { MarkdownPreview } from "./MarkdownPreview";

export interface StudyCardStackProps {
  cards: Flashcard[];
  decks: Deck[];
  onGradeCard: (card: Flashcard, quality: number) => Promise<void>;
  onEditCard?: (card: Flashcard) => void;
  onDeleteCard: (cardId: number) => Promise<void>;
  onNavigateReferenceTag: (referenceTag: string) => void;
  onOpenCreateModal: () => void;
}

export const StudyCardStack: React.FC<StudyCardStackProps> = ({
  cards,
  decks,
  onGradeCard,
  onEditCard,
  onDeleteCard,
  onNavigateReferenceTag,
  onOpenCreateModal,
}) => {
  const [showAnswer, setShowAnswer] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [exitDirection, setExitDirection] = useState<{
    x: number;
    y: number;
    rotateZ: number;
    rotateY: number;
  }>({ x: 340, y: -40, rotateZ: 14, rotateY: 22 });
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  const topCard = cards[0] ?? null;

  // Reset per-card interaction state when the top card changes
  useEffect(() => {
    setShowAnswer(false);
    setSelectedOptions([]);
    setIsAnimatingOut(false);
  }, [topCard?.id]);

  const handleToggleOption = useCallback(
    (optionText: string, isSingle: boolean) => {
      if (isSingle) {
        setSelectedOptions([optionText]);
      } else {
        setSelectedOptions((prev) =>
          prev.includes(optionText)
            ? prev.filter((o) => o !== optionText)
            : [...prev, optionText]
        );
      }
    },
    []
  );

  const handleScore = useCallback(
    async (quality: number) => {
      if (!topCard || isAnimatingOut) return;

      // Determine 3D trajectory based on score:
      // Again (1) -> shuffles left & back into deck
      // Hard (3) -> slides lower-right
      // Good (4) -> arcs right
      // Easy (5) -> launches upper-right
      if (quality < 3) {
        setExitDirection({ x: -320, y: 50, rotateZ: -14, rotateY: -25 });
      } else if (quality === 3) {
        setExitDirection({ x: 290, y: 35, rotateZ: 10, rotateY: 18 });
      } else if (quality === 4) {
        setExitDirection({ x: 360, y: -25, rotateZ: 14, rotateY: 24 });
      } else {
        setExitDirection({ x: 420, y: -70, rotateZ: 18, rotateY: 30 });
      }

      setIsAnimatingOut(true);
      await onGradeCard(topCard, quality);
    },
    [isAnimatingOut, onGradeCard, topCard]
  );

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-stone-200/90 bg-white px-8 py-16 text-center shadow-2xs">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Sparkles className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-stone-900">
          Deck Stack Complete!
        </h3>
        <p className="mt-1 mb-6 max-w-md text-xs leading-relaxed text-stone-500">
          All due cards in this deck have been reviewed and scheduled via the
          SM-2 algorithm. Add more cards or import a new JSON/CSV deck to keep
          studying.
        </p>
        <button
          type="button"
          onClick={onOpenCreateModal}
          className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 transition-colors cursor-pointer"
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Create Flashcards</span>
        </button>
      </div>
    );
  }

  // Render up to 4 cards in the 3D stack
  const visibleStack = cards.slice(0, 4);

  return (
    <div className="relative mx-auto w-full max-w-2xl pb-14 pt-2">
      {/* Stack Counter Pill */}
      <div className="mb-4 flex items-center justify-between text-xs text-stone-500 px-1">
        <span className="inline-flex items-center gap-1.5 font-medium text-stone-700">
          <Layers className="h-3.5 w-3.5 text-amber-600" />
          <span>
            3D Deck Stack: <strong>{cards.length}</strong>{" "}
            {cards.length === 1 ? "card" : "cards"} remaining in queue
          </span>
        </span>
        <span className="text-[11px] text-stone-400">
          Top card slides & shuffles on score
        </span>
      </div>

      {/* 3D Perspective Stack Stage */}
      <div
        className="relative min-h-[430px] w-full"
        style={{ perspective: "1400px" }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {visibleStack.map((card, stackIndex) => {
            const isTop = stackIndex === 0;
            const deckName =
              decks.find((d) => d.id === card.deck_id)?.name ?? "Study Deck";

            return (
              <motion.div
                key={`${card.id}-${card.repetitions}-${card.interval}`}
                layout
                initial={{
                  opacity: 0,
                  scale: 0.88,
                  y: 48,
                  rotateX: -8,
                }}
                animate={{
                  opacity: 1 - stackIndex * 0.16,
                  scale: 1 - stackIndex * 0.045,
                  y: stackIndex * 18,
                  z: -stackIndex * 45,
                  rotateX: -stackIndex * 2.5,
                  rotateZ: stackIndex === 0 ? 0 : stackIndex % 2 === 0 ? 1.2 : -1.2,
                  zIndex: 40 - stackIndex * 10,
                }}
                exit={{
                  x: exitDirection.x,
                  y: exitDirection.y,
                  rotateZ: exitDirection.rotateZ,
                  rotateY: exitDirection.rotateY,
                  scale: 0.82,
                  opacity: 0,
                  transition: {
                    duration: 0.42,
                    ease: [0.22, 1, 0.36, 1],
                  },
                }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 26,
                  mass: 0.9,
                }}
                style={{
                  transformStyle: "preserve-3d",
                  transformOrigin: "center top",
                }}
                className={`${
                  isTop ? "relative" : "pointer-events-none absolute inset-x-0 top-0"
                } rounded-2xl border border-stone-200/95 bg-white p-7 shadow-lg`}
              >
                {/* Card Metadata Header */}
                <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-full bg-stone-900 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                      <Layers className="h-3 w-3" />
                      <span>{deckName}</span>
                    </span>

                    <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-medium text-stone-700">
                      {card.card_type === "single_choice" ? (
                        <CircleDot className="h-3 w-3 text-sky-600" />
                      ) : card.card_type === "multiple_choice" ? (
                        <CheckSquare className="h-3 w-3 text-violet-600" />
                      ) : (
                        <Tag className="h-3 w-3 text-stone-400" />
                      )}
                      <span>{formatCardTypeLabel(card.card_type)}</span>
                    </span>

                    {/* Smart Tag Backlink (`reference_tag`) */}
                    {card.reference_tag && (
                      <button
                        type="button"
                        onClick={() =>
                          onNavigateReferenceTag(card.reference_tag!)
                        }
                        className="inline-flex items-center gap-1 rounded-full border border-amber-300/80 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 transition-colors cursor-pointer"
                        title={`Jump to smart reference: ${card.reference_tag}`}
                      >
                        <Tag className="h-2.5 w-2.5 text-amber-600" />
                        <span>{card.reference_tag}</span>
                        <ArrowUpRight className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>

                  {isTop && (
                    <div className="flex items-center gap-1">
                      {onEditCard && (
                        <button
                          type="button"
                          onClick={() => onEditCard(card)}
                          className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-800 transition-colors cursor-pointer"
                          title="Edit flashcard"
                          aria-label="Edit flashcard"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDeleteCard(card.id)}
                        className="rounded-lg p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
                        title="Delete flashcard"
                        aria-label="Delete flashcard"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Scheduling Stats Bar */}
                <div className="mb-5 flex flex-wrap items-center gap-2 text-[11px] text-stone-500 border-b border-stone-100 pb-3">
                  <span className="inline-flex items-center gap-1 rounded-md bg-stone-100/80 px-2 py-0.5 font-medium text-stone-600">
                    <Repeat className="h-3 w-3 text-stone-400" />
                    <span>Interval: {formatInterval(card.interval)}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-stone-100/80 px-2 py-0.5 font-medium text-stone-600">
                    <Gauge className="h-3 w-3 text-stone-400" />
                    <span>Ease: {formatEaseFactor(card.ease)}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 font-medium text-amber-800">
                    <Calendar className="h-3 w-3 text-amber-600" />
                    <span>Due: {formatReviewDate(card.next_review)}</span>
                  </span>
                </div>

                {/* Card Front (Rendered with MarkdownPreview + color directives) */}
                <div className="mb-6">
                  <span className="mb-2 inline-block rounded bg-stone-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-stone-600 uppercase">
                    Prompt
                  </span>
                  <div className="text-lg font-medium text-stone-900">
                    <MarkdownPreview markdown={card.front} />
                  </div>
                </div>

                {/* Interactive Choice Options for Single Choice / Multiple Choice Cards */}
                {(card.card_type === "single_choice" ||
                  card.card_type === "multiple_choice") &&
                  card.options.length > 0 && (
                    <div className="mb-6 space-y-2">
                      <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                        {card.card_type === "single_choice"
                          ? "Select One Answer:"
                          : "Select All That Apply:"}
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {card.options.map((optionText, idx) => {
                          const isSelected =
                            selectedOptions.includes(optionText);
                          const isAnswerMatch =
                            showAnswer &&
                            card.back
                              .toLowerCase()
                              .includes(optionText.toLowerCase());

                          return (
                            <button
                              key={`${idx}-${optionText}`}
                              type="button"
                              onClick={() =>
                                handleToggleOption(
                                  optionText,
                                  card.card_type === "single_choice"
                                )
                              }
                              className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-xs font-medium transition-all cursor-pointer ${
                                isAnswerMatch
                                  ? "border-emerald-400 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-300"
                                  : isSelected
                                    ? "border-stone-900 bg-stone-900 text-white"
                                    : "border-stone-200 bg-[#FBFBFA] text-stone-800 hover:border-stone-300 hover:bg-stone-100/70"
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <span
                                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold ${
                                    isSelected
                                      ? "bg-white/20 text-white"
                                      : "bg-stone-200/80 text-stone-700"
                                  }`}
                                >
                                  {String.fromCharCode(65 + idx)}
                                </span>
                                <span>{optionText}</span>
                              </div>
                              {isAnswerMatch && (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                {/* Answer Reveal & SM-2 Rating Controls */}
                {isTop && (
                  <>
                    {showAnswer ? (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="mb-6 rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4">
                          <span className="mb-1.5 inline-block rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-emerald-800 uppercase">
                            Answer & Explanation
                          </span>
                          <div className="text-sm text-stone-800">
                            <MarkdownPreview markdown={card.back} />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                          <button
                            type="button"
                            onClick={() => handleScore(1)}
                            className="flex flex-col items-center rounded-xl border border-red-200 bg-red-50/80 p-3 text-red-700 hover:bg-red-100 transition-colors cursor-pointer"
                          >
                            <RotateCcw className="mb-1 h-4 w-4" />
                            <strong className="text-xs">Again</strong>
                            <span className="mt-0.5 text-[10px] text-red-600/80">
                              Shuffle back (1d)
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleScore(3)}
                            className="flex flex-col items-center rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-amber-800 hover:bg-amber-100 transition-colors cursor-pointer"
                          >
                            <AlertCircle className="mb-1 h-4 w-4" />
                            <strong className="text-xs">Hard</strong>
                            <span className="mt-0.5 text-[10px] text-amber-700/80">
                              1.2× interval
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleScore(4)}
                            className="flex flex-col items-center rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer"
                          >
                            <CheckCircle2 className="mb-1 h-4 w-4" />
                            <strong className="text-xs">Good</strong>
                            <span className="mt-0.5 text-[10px] text-emerald-700/80">
                              {card.ease.toFixed(1)}× interval
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleScore(5)}
                            className="flex flex-col items-center rounded-xl border border-sky-200 bg-sky-50/80 p-3 text-sky-800 hover:bg-sky-100 transition-colors cursor-pointer"
                          >
                            <Zap className="mb-1 h-4 w-4" />
                            <strong className="text-xs">Easy</strong>
                            <span className="mt-0.5 text-[10px] text-sky-700/80">
                              Bonus interval
                            </span>
                          </button>
                        </div>
                      </motion.div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowAnswer(true)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-3.5 text-sm font-semibold text-white hover:bg-stone-800 transition-colors cursor-pointer"
                      >
                        <Eye className="h-4 w-4" />
                        <span>Reveal Answer</span>
                      </button>
                    )}
                  </>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default StudyCardStack;
