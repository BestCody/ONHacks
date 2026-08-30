import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2, Send } from 'lucide-react';

const TRACKS = ["AI / ML", "Web3 / Blockchain", "Developer Tools", "Security & Privacy"];

const BG = "/assets/apply-bg.webp";

export default function Apply() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    team_name: "",
    track: "",
    project_idea: "",
    github_link: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.full_name || !form.email || !form.track || !form.project_idea) {
      setError("Please fill in your name, email, track, and project idea.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Submission failed. Please try again.');
      }
      setDone(true);
    } catch (err) {
      setError(err.message || "Submission failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ backgroundImage: `url(${BG})`, backgroundRepeat: 'no-repeat', backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#163d6b' }}>
        <div className="max-w-md text-center bg-white rounded-2xl shadow-xl p-10">
          <h2 className="font-bubbly text-4xl text-[#FF2E2E] mb-3">You're in!</h2>
          <p className="text-black/70 mb-8">We received your application. See you at OTHacks — Nov 12.</p>
          <Button onClick={() => navigate('/')} className="bg-blue-600 hover:bg-blue-700 text-white">
            Back to home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen py-12 px-4"
      style={{ backgroundImage: `url(${BG})`, backgroundRepeat: 'no-repeat', backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#163d6b' }}>
      <div className="max-w-xl mx-auto">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-white/90 hover:text-white mb-6 text-sm font-medium drop-shadow">
          <ArrowLeft size={16} /> Back home
        </button>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h1 className="font-bubbly text-4xl text-[#0A1A2A] mb-2">Apply to OTHacks</h1>
          <p className="text-black/60 mb-8">Tell us about you and what you want to build.</p>

          {error && (
            <div className="mb-5 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full name *</Label>
              <Input id="full_name" value={form.full_name} onChange={setField("full_name")} placeholder="Ada Lovelace" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" value={form.email} onChange={setField("email")} placeholder="you@hack.dev" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="team_name">Team name (optional)</Label>
              <Input id="team_name" value={form.team_name} onChange={setField("team_name")} placeholder="The Byte Benders" />
            </div>

            <div className="space-y-2">
              <Label>Track *</Label>
              <Select value={form.track} onValueChange={(v) => setForm((f) => ({ ...f, track: v }))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick your battlefield" />
                </SelectTrigger>
                <SelectContent>
                  {TRACKS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="project_idea">Project idea *</Label>
              <Textarea
                id="project_idea"
                value={form.project_idea}
                onChange={setField("project_idea")}
                placeholder="What do you want to build in 48 hours?"
                rows={4}
                required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="github_link">GitHub / portfolio (optional)</Label>
              <Input id="github_link" value={form.github_link} onChange={setField("github_link")} placeholder="github.com/you" />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 text-lg font-bungee bg-[#FF2E2E] hover:bg-[#FF2E2E]/90 text-white">
              {loading ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Submitting...</>
              ) : (
                <><Send className="w-5 h-5 mr-2" />Submit Application</>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
