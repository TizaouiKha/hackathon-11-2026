import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";

// Déclarations de types : elles ne produisent rien en Go, mais leurs types
// doivent être traduits là où ils servent (tsTypeToGo).

type Score = number;

export type Result = DEither.Success<Score> | DEither.Fail;

interface User {
	name: string;
	age: number;
}

export interface Team {
	members: User[];
	leader: User;
}

type Pair = [Score, Score];

export function start() {
	return 1;
}

export function bestScore(score: Score): Result {
	return DEither.success(score);
}

export function keepUser(user: User) {
	return user;
}

export function keepTeam(team: Team) {
	return team;
}

export function users(team: Team[]) {
	return DArray.map(team, keepTeam);
}

export function pair(value: Pair) {
	return value;
}

export function show(value: unknown) {
	return DCommon.print(value);
}
