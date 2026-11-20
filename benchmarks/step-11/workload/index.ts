import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";

function compute(iterations: number) {
	let total = 0;

	for (let index = 0; index < iterations; index++) {
		const result = index % 2 === 0
			? DEither.success(index)
			: DEither.left("odd", index);

		if (DEither.isRight(result)) {
			total += DEither.unwrapRight(result);
		}
	}

	return total;
}

DCommon.print(compute(5_000_000));
