const moduleSeed = 3;
const tuples: [number, number][] = [
	[1, 2],
	[3, 4],
];

export function localAndIf(value: number): string {
	const total = value + moduleSeed;
	if (total > 5) {
		return "large";
	} else {
		return "small";
	}
}

export function emptyReturn(value: number): void {
	if (value < 0) {
		return;
	}
	return;
}

export function choose(condition: boolean): string {
	return condition ? "yes" : "no";
}

export function unary(value: number, condition: boolean): number {
	if (!condition) {
		return -(value + 1);
	}
	// eslint-disable-next-line no-implicit-coercion
	return +value;
}

export function logical(value: number): boolean {
	return value > 0 && value < 10;
}

export function expressionArrow(value: number): number {
	const double = (entry: number) => entry * 2;
	return double(value);
}

export function blockArrow(value: number): number {
	const increment = (entry: number) => {
		const result = entry + 1;
		return result;
	};
	return increment(value);
}

export function homogeneousTuple(one: number, two: number): number {
	const sum = ([left, right]: [number, number]) => left + right;
	return sum([one, two]);
}

export function heterogeneousTuple(value: number): number {
	const read = ([label, amount]: [string, number]) => amount;
	return read(["value", value]);
}

export function values(): number[] {
	return [1, -2, 3];
}

export function pair(): [string, number] {
	return ["answer", 42];
}

export function moduleTuples(): [number, number][] {
	return tuples;
}
