/** Built-in trivia bank. Nothing is fetched; add questions here. `answer` is an index into `options`. */
export interface Question { q: string; options: [string, string, string]; answer: 0 | 1 | 2 }

export const QUESTIONS: Question[] = [
  { q: "What color do you get by mixing blue and yellow?", options: ["Green", "Purple", "Orange"], answer: 0 },
  { q: "How many legs does a spider have?", options: ["Six", "Eight", "Ten"], answer: 1 },
  { q: "Which planet is known as the Red Planet?", options: ["Venus", "Jupiter", "Mars"], answer: 2 },
  { q: "What do bees make?", options: ["Honey", "Silk", "Wax paper"], answer: 0 },
  { q: "How many days are in a leap year?", options: ["365", "366", "364"], answer: 1 },
  { q: "Which animal is the largest on Earth?", options: ["Elephant", "Giraffe", "Blue whale"], answer: 2 },
  { q: "What is frozen water called?", options: ["Ice", "Steam", "Fog"], answer: 0 },
  { q: "Which shape has three sides?", options: ["Square", "Triangle", "Circle"], answer: 1 },
  { q: "What is the closest star to Earth?", options: ["Polaris", "Sirius", "The Sun"], answer: 2 },
  { q: "Which instrument has 88 keys?", options: ["Piano", "Violin", "Flute"], answer: 0 },
  { q: "What do caterpillars turn into?", options: ["Beetles", "Butterflies", "Bats"], answer: 1 },
  { q: "How many minutes are in an hour?", options: ["100", "30", "60"], answer: 2 },
  { q: "Which fruit is famous for keeping the doctor away?", options: ["Apple", "Banana", "Grape"], answer: 0 },
  { q: "Which bird is a symbol of wisdom in many stories?", options: ["Pigeon", "Owl", "Duck"], answer: 1 },
  { q: "What gas do plants take in from the air?", options: ["Oxygen", "Helium", "Carbon dioxide"], answer: 2 },
  { q: "How many continents are there?", options: ["Seven", "Five", "Nine"], answer: 0 },
];

/** Pick `n` distinct questions at random. */
export function pickQuestions(n: number): Question[] {
  const pool = [...QUESTIONS];
  const out: Question[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}
