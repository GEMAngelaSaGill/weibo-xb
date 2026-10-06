import { cn } from '@/lib/utils'

export interface ChannelBarItem {
  id: string
  label: string
}

interface ChannelBarProps {
  items: ChannelBarItem[]
  selectedId: string
  onSelect: (id: string) => void
}

export function ChannelBar({ items, selectedId, onSelect }: ChannelBarProps) {
  return (
    <div className="border-border/40 flex w-full scrollbar-none gap-1.5 overflow-x-auto border-b px-1 py-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          className={cn(
            'inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-medium transition-colors',
            selectedId === item.id
              ? 'bg-foreground text-background'
              : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
