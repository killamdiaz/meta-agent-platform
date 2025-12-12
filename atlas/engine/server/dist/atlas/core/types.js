export function compareVersions(a, b) {
    const parse = (v) => v.split('.').map((part) => Number(part));
    const [a1, a2, a3] = parse(a);
    const [b1, b2, b3] = parse(b);
    if (a1 !== b1)
        return a1 > b1 ? 1 : -1;
    if (a2 !== b2)
        return a2 > b2 ? 1 : -1;
    if (a3 !== b3)
        return a3 > b3 ? 1 : -1;
    return 0;
}
export function isVersionGreater(next, current) {
    return compareVersions(next, current) === 1;
}
