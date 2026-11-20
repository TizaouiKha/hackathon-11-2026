import * as DCommon from "@duplojs/lang/common";

// Un objet avec une liste, un tuple mixte et un Record.

interface Product {
	name: string;
	price: number;
	tags: string[];
}

type PriceLine = [string, number];

const catalog: Record<string, Product> = {
	pen: {
		name: "stylo",
		price: 1.5,
		tags: ["bureau", "écriture"],
	},
};

function line(product: Product): PriceLine {
	return [product.name, product.price];
}

const pen = catalog.pen!;
const [name, price] = line(pen);

DCommon.print(`${name} coûte ${price} (${pen.tags.length} étiquettes)`);
