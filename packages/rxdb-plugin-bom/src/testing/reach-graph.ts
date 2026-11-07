interface Graph {
  items: string[];
  edges: [string, string][];
}

/** n串菱形只有3n+1个物料与4n条边（默认20串：61物料/80边），路径数2^n另由预算控制。 */
export const reachDiamonds = (layers = 20): Graph => {
  const items = ['root'];
  const edges: Graph['edges'] = [];
  let top = 'root';
  for (let index = 0; index < layers; index += 1) {
    const left = `left-${index}`;
    const right = `right-${index}`;
    const bottom = `bottom-${index}`;
    items.push(left, right, bottom);
    edges.push([top, left], [top, right], [left, bottom], [right, bottom]);
    top = bottom;
  }
  return { items, edges };
};
