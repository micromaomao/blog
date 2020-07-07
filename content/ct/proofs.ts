export class TreeSegment {
	start: number;
	end: number;
	constructor (start: number, end: number) {
		this.start = start;
		this.end = end;
	}
}

export function make_inclusion_proof(tree_size: number, index: number): TreeSegment[] {
	// translated directly from rust code
	if (index >= tree_size) {
		throw new Error("assert");
	}
  let current_subtree = new TreeSegment(index, index + 1);
	let result = [];
  while (current_subtree.end - current_subtree.start < tree_size) {
    let next_subtree_len = (current_subtree.end - current_subtree.start) * 2;
    let next_subtree_start = Math.floor(current_subtree.start / next_subtree_len) * next_subtree_len;
    let next_subtree = new TreeSegment(next_subtree_start, next_subtree_start + next_subtree_len);
    let mid = next_subtree_start + Math.floor(next_subtree_len / 2);
    if (index < mid) {
      // hash right
      if (mid < tree_size) {
        result.push(new TreeSegment(mid, Math.min(next_subtree.end, tree_size)));
      } else {
        // Happens if the last part of the tree is incomplete.
        // Do nothing.
      }
    } else {
      // hash left
      result.push(new TreeSegment(next_subtree_start, mid));
    }
    current_subtree = next_subtree;
  }
  return result;
}

function largest_power_of_2_smaller_than(n: number): number {
  if (n <= 1) {
    return 0;
  }
  if (n == 2) {
    return 1;
  }
  n -= 1;
  let pow = 1;
  while (true) {
		n = Math.floor(n / 2);
    pow *= 2;
    if (n == 1) {
      return pow;
    }
  }
}

export function make_consistency_proof(from_size: number, to_size: number): TreeSegment[] {
	// again translated from rust
  let result_store: TreeSegment[] = [];
	function inner(subtree: TreeSegment, from_size: number) {
		if (subtree.start >= subtree.end || from_size > subtree.end) {
			throw new Error("assert");
		}
    if (from_size == subtree.end) {
      result_store.push(subtree);
      return;
    }
    let subtree_size = subtree.end - subtree.start;
    let start_of_right_branch = largest_power_of_2_smaller_than(subtree_size);
    if (from_size - subtree.start <= start_of_right_branch) { // go left
      result_store.push(new TreeSegment(subtree.start + start_of_right_branch, subtree.end));
      inner(new TreeSegment(subtree.start, subtree.start + start_of_right_branch), from_size);
    } else { // go right
      result_store.push(new TreeSegment(subtree.start, subtree.start + start_of_right_branch));
      inner(new TreeSegment(subtree.start + start_of_right_branch, subtree.end), from_size);
    }
  }
  inner(new TreeSegment(0, to_size), from_size);
  result_store.reverse();
  return result_store;
}
