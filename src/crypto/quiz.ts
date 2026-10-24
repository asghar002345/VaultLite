export interface QuizQuestion {
  index: number; // 0-based word position
  options: string[];
  answer: string;
}

/** Build a backup quiz: `count` random positions, each with 1 correct + 3 decoys from the phrase. */
export function buildQuiz(words: string[], count = 3, rand: () => number = Math.random): QuizQuestion[] {
  const positions = shuffle([...words.keys()], rand).slice(0, count).sort((a, b) => a - b);
  return positions.map((index) => {
    const answer = words[index];
    const decoys = shuffle(
      [...new Set(words.filter((w) => w !== answer))],
      rand,
    ).slice(0, 3);
    return { index, answer, options: shuffle([answer, ...decoys], rand) };
  });
}

function shuffle<T>(a: T[], rand: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
