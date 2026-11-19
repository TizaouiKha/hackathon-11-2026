import * as DEither from "@duplojs/lang/either";
import * as DCommon from "@duplojs/lang/common";
import * as DArray from "@duplojs/lang/array";
import * as DString from "@duplojs/lang/string";
import { calculate } from "./operations";

const calculations = DEither.asyncGroup([
	() => calculate(1, 2, 1),
	() => calculate(4, 5, 3),
	() => calculate(2, 3, 0),
]);

const completedCalculations = DCommon.asyncPipe(
	calculations,
	DEither.whenIsRightOtherwise(
		(values) => DArray.map(values, DString.to),
		() => ["transaction annulée"],
	),
);

DCommon.print(await completedCalculations);

