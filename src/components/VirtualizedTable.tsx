import React from 'react';
import { AutoSizer, List } from 'react-virtualized';

interface VirtualizedTableProps<T> {
  items: T[];
  rowHeight: number;
  renderRow: (item: T, index: number) => React.ReactNode;
  className?: string;
}

function VirtualizedTable<T>({ items, rowHeight, renderRow, className = '' }: VirtualizedTableProps<T>) {
  return (
    <div className={`h-[600px] ${className}`}>
      <AutoSizer>
        {({ width, height }) => (
          <List
            width={width}
            height={height}
            rowCount={items.length}
            rowHeight={rowHeight}
            rowRenderer={({ index, style }) => (
              <div style={style}>
                {renderRow(items[index], index)}
              </div>
            )}
          />
        )}
      </AutoSizer>
    </div>
  );
}

export default VirtualizedTable;