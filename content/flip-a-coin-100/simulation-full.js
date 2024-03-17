const seq_len = 100;
const n_runs = 1000000;

let a_score_sum = 0;
let b_score_sum = 0;
let a_wins = 0;
let b_wins = 0;

let a_hist = new Map();
let b_hist = new Map();
let max_score = seq_len - 1;

function run() {
  let sequence = Array.from({ length: seq_len }, () => Math.random() > 0.5 ? 'H' : 'T');
  let a_score = sequence.filter((_, i) => i < seq_len - 1 && sequence[i] === 'H' && sequence[i + 1] === 'H').length;
  let b_score = sequence.filter((_, i) => i < seq_len - 1 && sequence[i] === 'H' && sequence[i + 1] === 'T').length;
  a_score_sum += a_score;
  b_score_sum += b_score;
  a_hist.set(a_score, (a_hist.get(a_score) || 0) + 1);
  b_hist.set(b_score, (b_hist.get(b_score) || 0) + 1);

  if (a_score > b_score) {
    a_wins++;
  } else if (b_score > a_score) {
    b_wins++;
  }
}

for (let i = 0; i < n_runs; i++) {
  run();
}
console.log(`Alice wins: ${a_wins}, Bob wins: ${b_wins}`);
console.log(`Alice wins ${a_wins / n_runs * 100}% of the time`);
console.log(`Bob wins ${b_wins / n_runs * 100}% of the time`);
console.log(`Average score for Alice: ${a_score_sum / n_runs}, Bob: ${b_score_sum / n_runs}`);

function print_hist() {
  console.log('score,a_freq,b_freq');
  for (let score = 0; score <= max_score; score += 1) {
    let a_val = a_hist.get(score) || 0;
    let b_val = b_hist.get(score) || 0;
    console.log(`${score},${a_val},${b_val}`);
  }
}

print_hist();
