import { useMemo, useState } from "react";
import type { TreeItem } from "../api";
import { itemKey } from "../components/files/source";

export function useSelection(items: TreeItem[]) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const selectedItems = useMemo(
    () => items.filter((item) => selectedKeys.includes(itemKey(item))),
    [items, selectedKeys],
  );
  return {
    selectedKeys,
    selectedItems,
    isSelected: (item: TreeItem) => selectedKeys.includes(itemKey(item)),
    toggle(item: TreeItem) {
      const key = itemKey(item);
      setSelectedKeys((current) =>
        current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
      );
    },
    toggleAll() {
      setSelectedKeys((current) =>
        current.length === items.length ? [] : items.map(itemKey),
      );
    },
    clear: () => setSelectedKeys([]),
  };
}