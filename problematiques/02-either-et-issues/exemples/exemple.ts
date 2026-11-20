import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";

// Une division à trois issues.

function divide(dividend: number, divisor: number) {
	if (divisor === 0) {
		return DEither.left("division-by-zero", dividend);
	}

	if (dividend < 0) {
		return DEither.left("negative-operand", dividend);
	}

	return DEither.success(dividend / divisor);
}

function describe(result: ReturnType<typeof divide>) {
	if (DEither.isRight(result)) {
		return `succès : ${DEither.unwrapRight(result)}`;
	}

	if (DEither.hasInformation(result, "division-by-zero")) {
		return `erreur division-by-zero (dividende ${DEither.unwrapLeft(result)})`;
	}

	return `erreur negative-operand (dividende ${DEither.unwrapLeft(result)})`;
}

DCommon.print(describe(divide(10, 4)));
DCommon.print(describe(divide(10, 0)));
DCommon.print(describe(divide(-6, 3)));
