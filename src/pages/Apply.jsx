import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { ArrowLeft, Loader2, Send } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const BG = '/assets/apply-bg.webp';

export default function Apply() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [form, setForm] = useState({
    name: '',
    team: '',
    github: '',
    highSchool: false,
    supplies: false,
    heardAbout: '',
    email: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!user) return;

    setForm((previous) => ({
      ...previous,
      name: previous.name || user.name,
      email: previous.email || user.email,
    }));
  }, [user]);

  const setField = (field) => (event) => {
    setForm((previous) => ({
      ...previous,
      [field]: event.target.value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!form.name.trim()) {
      setError('Please enter your first and last name.');
      return;
    }

    if (!form.team) {
      setError('Please select whether you are with a team.');
      return;
    }

    if (!form.github.trim()) {
      setError('Please enter your GitHub username.');
      return;
    }

    if (!form.highSchool) {
      setError(
        'Please confirm that you are in high school to participate.'
      );
      return;
    }

    if (!form.supplies) {
      setError(
        'Please confirm that you are bringing your computer, charger, and anything you need.'
      );
      return;
    }

    if (!form.heardAbout.trim()) {
      setError('Please tell us how you heard about us.');
      return;
    }
    if (!form.email.trim()) {
      setError('Please enter your personal email.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/event-applications', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: form.name.trim(),
          team: form.team,
          github: form.github.trim(),
          highSchool: form.highSchool,
          supplies: form.supplies,
          heardAbout: form.heardAbout.trim(),
          email: form.email.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Submission failed. Please try again.');
      }

      setDone(true);
    } catch (err) {
      console.error(err);
      setError('Submission failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{
          backgroundImage: `url(${BG})`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundColor: '#163d6b',
        }}
      >
        <div className="max-w-md text-center bg-white rounded-2xl shadow-xl p-10">
          <h2 className="font-bubbly text-4xl text-[#FF2E2E] mb-3">
            You're in!
          </h2>

          <p className="text-black/70 mb-8">
            Thanks for filling the form :) We received your
            registration. See you at the hackathon!
          </p>

          <Button
            onClick={() => navigate('/')}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Back to home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen py-12 px-4"
      style={{
        backgroundImage: `url(${BG})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: '#163d6b',
      }}
    >
      <div className="max-w-xl mx-auto">

        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-white/90 hover:text-white mb-6 text-sm font-medium drop-shadow"
        >
          <ArrowLeft size={16} />
          Back home
        </button>

        <div className="bg-white rounded-2xl shadow-xl p-8">

          <h1 className="font-bubbly text-4xl text-[#0A1A2A] mb-2">
            Apply to OTHacks
          </h1>

          <p className="text-black/60 mb-8">
            Tell us about you and get ready to build something awesome!
          </p>

          {user ? (
            <p className="mb-5 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
              Signed in as {user.email}. This application will be saved to your account.
            </p>
          ) : (
            <p className="mb-5 text-sm text-black/60">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => navigate('/signin?returnTo=%2Fapply')}
                className="font-semibold text-[#0A1A2A] underline underline-offset-2 hover:text-[#FF2E2E]"
              >
                Sign in first
              </button>
              {' '}to prefill your details.
            </p>
          )}

          {error && (
            <div className="mb-5 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* First name and last name */}

            <div className="space-y-2">
              <Label htmlFor="name">
                First name and last name *
              </Label>

              <Input
                id="name"
                value={form.name}
                onChange={setField('name')}
                placeholder="Ada Lovelace"
                required
              />
            </div>

            {/* Team */}

            <div className="space-y-2">
              <Label>
                Are you with a team? *
              </Label>

              <div className="grid grid-cols-2 gap-3">

                <Button
                  type="button"
                  onClick={() =>
                    setForm((previous) => ({
                      ...previous,
                      team: 'Yes',
                    }))
                  }
                  className={
                    form.team === 'Yes'
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-white border border-gray-300 text-gray-800 hover:bg-gray-50'
                  }
                >
                  Yes
                </Button>

                <Button
                  type="button"
                  onClick={() =>
                    setForm((previous) => ({
                      ...previous,
                      team: 'No',
                    }))
                  }
                  className={
                    form.team === 'No'
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-white border border-gray-300 text-gray-800 hover:bg-gray-50'
                  }
                >
                  No
                </Button>

              </div>
            </div>

            {/* GitHub */}

            <div className="space-y-2">
              <Label htmlFor="github">
                Please give us your GitHub *
              </Label>

              <Input
                id="github"
                value={form.github}
                onChange={setField('github')}
                placeholder="github.com/adalovelace"
                required
              />

              <p className="text-xs text-black/50">
                Enter your GitHub username.
              </p>
            </div>

            {/* High school */}

            <div className="space-y-2">
              <Label>
                You or your team need to be in high-school to
                participate. Are you in high school? *
              </Label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.highSchool}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      highSchool: event.target.checked,
                    }))
                  }
                  className="w-5 h-5 accent-blue-600"
                  required
                />

                <span>
                  YES
                </span>
              </label>
            </div>

            {/* Supplies */}

            <div className="space-y-2">
              <Label>
                You and your team need to bring your own supplies.
                Are you bringing your computer, charger, and anything
                you might need? *
              </Label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.supplies}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      supplies: event.target.checked,
                    }))
                  }
                  className="w-5 h-5 accent-blue-600"
                  required
                />

                <span>
                  YES
                </span>
              </label>
            </div>

            {/* How did you hear about us */}

            <div className="space-y-2">
              <Label htmlFor="heardAbout">
                How did you hear about us? (say in short)
              </Label>

              <Input
                id="heardAbout"
                value={form.heardAbout}
                onChange={setField('heardAbout')}
                placeholder="Instagram, my school, a friend..."
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">
                What is your email? (personal) *
              </Label>

              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={setField('email')}
                placeholder="ada@example.com"
                required
                />
            </div>

            {/* Submit */}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 text-lg font-bungee bg-[#FF2E2E] hover:bg-[#FF2E2E]/90 text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5 mr-2" />
                  Submit Application
                </>
              )}
            </Button>

          </form>
        </div>
      </div>
    </div>
  );
}
