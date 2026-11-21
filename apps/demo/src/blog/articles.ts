import { faker } from "@faker-js/faker";

export interface Article {
	slug: string;
	title: string;
	author: string;
	date: string;
	paragraphs: string[];
}

const ARTICLE_COUNT = 15;
const SEED = 1011;

function titleCase(sentence: string): string {
	const text = sentence.replace(/\.$/, "");
	return text.charAt(0).toUpperCase() + text.slice(1);
}

function slugify(title: string, index: number): string {
	const words = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
	return `${index + 1}-${words.replace(/^-|-$/g, "")}`;
}

/** Placeholder articles. The seed keeps them the same on every run, and no title or paragraph repeats. */
export function createArticles(count = ARTICLE_COUNT): Article[] {
	faker.seed(SEED);
	const usedTitles = new Set<string>();
	const usedParagraphs = new Set<string>();

	const nextUnique = (create: () => string, used: Set<string>): string => {
		let value = create();
		while (used.has(value)) value = create();
		used.add(value);
		return value;
	};

	return Array.from({ length: count }, (_, index) => {
		const title = nextUnique(
			() => titleCase(faker.lorem.sentence({ min: 3, max: 6 })),
			usedTitles,
		);
		return {
			slug: slugify(title, index),
			title,
			author: faker.person.fullName(),
			date: faker.date
				.between({ from: "2025-01-01", to: "2026-11-01" })
				.toISOString()
				.slice(0, 10),
			paragraphs: Array.from(
				{ length: faker.number.int({ min: 3, max: 5 }) },
				() =>
					nextUnique(
						() => faker.lorem.paragraph({ min: 4, max: 7 }),
						usedParagraphs,
					),
			),
		};
	});
}
