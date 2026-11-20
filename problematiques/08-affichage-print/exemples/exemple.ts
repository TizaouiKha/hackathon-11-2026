import * as DCommon from "@duplojs/lang/common";

// print écrit comme util.inspect de Node.

interface Player {
	name: string;
	score: number;
	tags: string[];
	active: boolean;
}

const player: Player = {
	name: "Ada",
	score: 1.5,
	tags: ["admin", "dev"],
	active: true,
};

DCommon.print(player);
DCommon.print([1, 2, 3]);
DCommon.print("Ada");
