export type NonEmpty<Item> = readonly [Item, ...Item[]];

export const isNonEmpty = <Item>(items: readonly Item[]): items is NonEmpty<Item> => items.length > 0;
