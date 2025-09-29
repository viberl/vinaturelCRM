import { ReactNode } from "react";
import { Search, Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TopBarProps {
  title: string;
  showSearch?: boolean;
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  actions?: ReactNode;
}

export default function TopBar({
  title,
  showSearch = true,
  searchValue,
  searchPlaceholder = "Kunden suchen...",
  onSearchChange,
  actions
}: TopBarProps) {
  return (
    <header className="bg-card shadow-sm border-b border-border px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
          {showSearch && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                type="text"
                placeholder={searchPlaceholder}
                className="pl-10 w-64"
                value={searchValue !== undefined ? searchValue : undefined}
                onChange={(event) => onSearchChange?.(event.target.value)}
              />
            </div>
          )}
        </div>
        <div className="flex items-center space-x-3">
          {actions ?? (
            <>
              <Button variant="outline" className="border-border text-foreground hover:bg-muted">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Neuer Kunde
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
