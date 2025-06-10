
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SyncResult {
  imported: number;
  updated: number;
  errors: number;
  message: string;
}

export default function ShopwareSync() {
  const [isLoading, setIsLoading] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const { toast } = useToast();

  const handleSync = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/shopware/sync', {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Sync failed');
      }

      const result: SyncResult = await response.json();
      setLastSync(result);

      toast({
        title: "Shopware Sync erfolgreich",
        description: `${result.imported} neue Kunden importiert, ${result.updated} aktualisiert`,
      });
    } catch (error) {
      toast({
        title: "Sync fehlgeschlagen",
        description: error instanceof Error ? error.message : "Unbekannter Fehler",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Download className="h-5 w-5" />
          <span>Shopware Integration</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          Importiere Kundendaten aus deinem Shopware-Shop
        </p>
        
        <Button 
          onClick={handleSync} 
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Synchronisiere...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Kunden synchronisieren
            </>
          )}
        </Button>

        {lastSync && (
          <div className="space-y-2 pt-4 border-t">
            <h4 className="text-sm font-medium">Letzter Sync:</h4>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="text-xs">
                <CheckCircle className="h-3 w-3 mr-1" />
                {lastSync.imported} neu
              </Badge>
              <Badge variant="outline" className="text-xs">
                <RefreshCw className="h-3 w-3 mr-1" />
                {lastSync.updated} aktualisiert
              </Badge>
              {lastSync.errors > 0 && (
                <Badge variant="destructive" className="text-xs">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {lastSync.errors} Fehler
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
