import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";

function failed(): DEither.Fail | DEither.Success<number> {
	return DEither.fail();
}

function successOf(value: number): DEither.Fail | DEither.Success<number> {
	return DEither.success(value);
}

function double(value: number) {
	return value * 2;
}

DCommon.print(3);
DCommon.print(DEither.success(3));
DCommon.print(failed());
DCommon.print(DEither.whenIsRight(successOf(3), double));
DCommon.print(DCommon.print(3));
