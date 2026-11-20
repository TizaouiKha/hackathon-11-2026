import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";

// Le type d'une même variable change selon l'endroit.

function double(value: number | string) {
	if (typeof value === "number") {
		return `${value * 2}`;
	}

	return value + value;
}

function check(amount: number) {
	return amount < 0
		? DEither.left("negative", amount)
		: DEither.success(amount);
}

function report(amount: number) {
	const result = check(amount);

	if (DEither.isLeft(result)) {
		return "refusé";
	}

	return `accepté : ${DEither.unwrapRight(result) + 1}`;
}

function nameOrDefault(name: string | undefined) {
	return name ?? "anonyme";
}

DCommon.print(double(21));
DCommon.print(double("ab"));
DCommon.print(report(-5));
DCommon.print(report(41));
DCommon.print(nameOrDefault(undefined));
DCommon.print(nameOrDefault("Ada"));
