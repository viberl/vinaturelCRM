import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) throw new Error(await res.text());
      navigate("/map");
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-80">
        <CardContent className="p-6 space-y-4">
          <h1 className="text-xl font-semibold text-center">Login</h1>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <form className="space-y-3" onSubmit={handleSubmit}>
            <input
              type="text"
              className="w-full border p-2 rounded"
              placeholder="Benutzername"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              type="password"
              className="w-full border p-2 rounded"
              placeholder="Passwort"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button className="w-full" type="submit">
              Anmelden
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
