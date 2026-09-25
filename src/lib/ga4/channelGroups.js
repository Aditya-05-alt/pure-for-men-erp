import { pctChange } from '@/lib/overview/comparePeriod';
import { colorForChannel } from '@/lib/ga4/channelDisplay';

/** Rollup rows disabled for advance — each GA4 channel stays its own column. */
export const CHANNEL_GROUP_DEFS = [];

export const CHANNEL_GROUP_KEYS = CHANNEL_GROUP_DEFS.map((g) => g.key);

export function normalizeChannelKey(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function isMemberOfGroup(channelName, group) {
  const key = normalizeChannelKey(channelName);
  return group.members.some((m) => normalizeChannelKey(m) === key);
}

function findGroupForChannel(channelName) {
  return CHANNEL_GROUP_DEFS.find((g) => isMemberOfGroup(channelName, g));
}

function memberKeysSet() {
  const keys = new Set();
  for (const group of CHANNEL_GROUP_DEFS) {
    for (const member of group.members) {
      keys.add(normalizeChannelKey(member));
    }
  }
  return keys;
}

const GROUPED_MEMBER_KEYS = memberKeysSet();

function sumField(items, field) {
  return items.reduce((sum, item) => sum + (Number(item[field]) || 0), 0);
}

/** Donut / list items → rollup headers + member rows (members stay separate). */
export function applyChannelGroupsToDonutItems(items) {
  const list = items || [];
  const ungrouped = list.filter(
    (item) => !GROUPED_MEMBER_KEYS.has(normalizeChannelKey(item.name))
  );

  const blocks = CHANNEL_GROUP_DEFS.map((group) => {
    const members = list
      .filter((item) => isMemberOfGroup(item.name, group))
      .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));

    if (members.length === 0) return null;

    const rollupValue = sumField(members, 'value');
    const rollupPct = sumField(members, 'pct');
    const hasDelta = members.some((m) => m.delta != null);

    return {
      sortValue: rollupValue,
      rollup: {
        name: group.label,
        fullName: group.label,
        color: group.color || members[0]?.color || colorForChannel(group.label),
        value: rollupValue,
        pct: rollupPct,
        delta: hasDelta ? pctChange(rollupValue, sumField(members, 'cmpValue')) : undefined,
        isGroupRollup: true,
        groupKey: group.key,
        memberCount: members.length,
        collapsible: group.includeMembers && members.length > 0,
      },
      members: group.includeMembers
        ? members.map((member) => ({
            ...member,
            isGroupMember: true,
            groupKey: group.key,
          }))
        : [],
    };
  }).filter(Boolean);

  const entries = [
    ...ungrouped.map((item) => ({
      kind: 'solo',
      sortValue: Number(item.value) || 0,
      item,
    })),
    ...blocks.map((block) => ({
      kind: 'block',
      sortValue: block.sortValue,
      block,
    })),
  ].sort((a, b) => b.sortValue - a.sortValue || 0);

  const result = [];
  for (const entry of entries) {
    if (entry.kind === 'solo') {
      result.push(entry.item);
      continue;
    }
    result.push(entry.block.rollup);
    result.push(...entry.block.members);
  }
  return result;
}

/** Comparison table rows → rollup headers + member rows. */
export function applyChannelGroupsToComparisonRows(rows) {
  const list = rows || [];
  const ungrouped = list.filter(
    (row) => !GROUPED_MEMBER_KEYS.has(normalizeChannelKey(row.ch))
  );

  const blocks = CHANNEL_GROUP_DEFS.map((group) => {
    const members = list
      .filter((row) => isMemberOfGroup(row.ch, group))
      .sort((a, b) => b.cur - a.cur || b.cmp - a.cmp || a.ch.localeCompare(b.ch));

    if (members.length === 0) return null;

    const cur = sumField(members, 'cur');
    const cmp = sumField(members, 'cmp');
    const ly = sumField(members, 'ly');

    return {
      sortValue: cur,
      rollup: {
        ch: group.label,
        rowKey: `${group.key}-rollup`,
        cur,
        cmp,
        ly,
        delta: pctChange(cur, cmp),
        curYoyDelta: pctChange(cur, ly),
        color: group.color || members[0]?.color || colorForChannel(group.label),
        isGroupRollup: true,
        groupKey: group.key,
        memberCount: members.length,
        collapsible: group.includeMembers && members.length > 0,
      },
      members: group.includeMembers
        ? members.map((member) => ({
            ...member,
            rowKey: `${group.key}-${normalizeChannelKey(member.ch)}`,
            isGroupMember: true,
            groupKey: group.key,
          }))
        : [],
    };
  }).filter(Boolean);

  const entries = [
    ...ungrouped.map((row) => ({
      kind: 'solo',
      sortValue: row.cur,
      row: { ...row, rowKey: row.ch },
    })),
    ...blocks.map((block) => ({
      kind: 'block',
      sortValue: block.sortValue,
      block,
    })),
  ].sort((a, b) => b.sortValue - a.sortValue || 0);

  const result = [];
  for (const entry of entries) {
    if (entry.kind === 'solo') {
      result.push(entry.row);
      continue;
    }
    result.push(entry.block.rollup);
    result.push(...entry.block.members);
  }
  return result;
}

/** Hide member rows when their group rollup is collapsed. */
export function filterByExpandedGroups(rows, expandedGroupKeys) {
  const expanded = expandedGroupKeys instanceof Set
    ? expandedGroupKeys
    : new Set(expandedGroupKeys || []);
  return (rows || []).filter((row) => {
    if (!row.isGroupMember) return true;
    return expanded.has(row.groupKey);
  });
}

/** Attach baseline compare values before grouping (for rollup MoM on donuts). */
export function attachCompareValuesForGrouping(items, compareItems) {
  const cmpMap = new Map();
  for (const item of compareItems || []) {
    cmpMap.set(normalizeChannelKey(item.name), Number(item.value) || 0);
  }
  return (items || []).map((item) => ({
    ...item,
    cmpValue: cmpMap.get(normalizeChannelKey(item.name)) || 0,
  }));
}

export { findGroupForChannel, isMemberOfGroup };
