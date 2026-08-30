import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { ArrowLeft, Loader2, Send } from 'lucide-react';


/* =====================================================
   GOOGLE FORM
   ===================================================== */

const GOOGLE_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScjVOvcX4mo0q_tCHkfDX7-h-qtPhXiPGDei7XttNhj0QojAA/formResponse';


/* =====================================================
   GOOGLE FORM QUESTION IDs
   ===================================================== */

const ENTRY = {
  fullName: 'entry.2034160097',
  team: 'entry.1501179330',
  github: 'entry.229203195',
  highSchool: 'entry.1740451237',
  supplies: 'entry.1883098233',
  heardAbout: 'entry.1851102738'
};


/* =====================================================
   BACKGROUND
   ===================================================== */

const BG = '/assets/apply-bg.webp';


export default function Apply() {

  const navigate = useNavigate();

  const [form, setForm] = useState({
    fullName: '',
    team: '',
    github: '',
    highSchool: false,
    supplies: false,
    heardAbout: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);


  /* ===================================================
     UPDATE INPUTS
     =================================================== */

  const setField = (field) => (e) => {
    setForm((previous) => ({
      ...previous,
      [field]: e.target.value
    }));
  };


  /* ===================================================
     SUBMIT TO GOOGLE FORM
     =================================================== */

  const handleSubmit = async (e) => {

    e.preventDefault();

    setError('');


    /* -----------------------------------------------
       VALIDATION
       ----------------------------------------------- */

    if (!form.fullName.trim()) {
      setError('Please enter your first and last name.');
      return;
    }

    if (!form.team) {
      setError('Please select Yes or No for the team question.');
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


    setLoading(true);


    try {

      /* ---------------------------------------------
         CREATE GOOGLE FORM DATA
         --------------------------------------------- */

      const formData = new FormData();

      formData.append(
        ENTRY.fullName,
        form.fullName.trim()
      );

      formData.append(
        ENTRY.team,
        form.team
      );

      formData.append(
        ENTRY.github,
        form.github.trim()
      );

      formData.append(
        ENTRY.highSchool,
        'YES'
      );

      formData.append(
        ENTRY.supplies,
        'YES'
      );

      formData.append(
        ENTRY.heardAbout,
        form.heardAbout.trim()
      );


      /* ---------------------------------------------
         SEND TO GOOGLE FORMS
         --------------------------------------------- */

      await fetch(GOOGLE_FORM_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: formData
      });


      /* ---------------------------------------------
         SUCCESS
         --------------------------------------------- */

      setDone(true);

    } catch (err) {

      console.error(err);

      setError(
        'Submission failed. Please try again.'
      );

    } finally {

      setLoading(false);

    }

  };


  /* ===================================================
     SUCCESS SCREEN
     =================================================== */

  if (done) {

    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{
          backgroundImage: `url(${BG})`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundColor: '#163d6b'
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


  /* ===================================================
     APPLICATION PAGE
     =================================================== */

  return (
    <div
      className="min-h-screen py-12 px-4"
      style={{
        backgroundImage: `url(${BG})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: '#163d6b'
      }}
    >

      <div className="max-w-xl mx-auto">


        {/* BACK HOME */}

        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-white/90 hover:text-white mb-6 text-sm font-medium drop-shadow"
        >
          <ArrowLeft size={16} />
          Back home
        </button>


        {/* FORM CARD */}

        <div className="bg-white rounded-2xl shadow-xl p-8">


          {/* TITLE */}

          <h1 className="font-bubbly text-4xl text-[#0A1A2A] mb-2">
            Apply to OTHacks
          </h1>

          <p className="text-black/60 mb-8">
            Tell us about you and get ready to build something awesome!
          </p>


          {/* ERROR */}

          {error && (
            <div className="mb-5 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}


          {/* FORM */}

          <form
            onSubmit={handleSubmit}
            className="space-y-5"
          >


            {/* =========================================
                FIRST NAME + LAST NAME
            ========================================== */}

            <div className="space-y-2">

              <Label htmlFor="fullName">
                First name and last name *
              </Label>

              <Input
                id="fullName"
                value={form.fullName}
                onChange={setField('fullName')}
                placeholder="Ada Lovelace"
                required
              />

            </div>


            {/* =========================================
                TEAM
            ========================================== */}

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
                      team: 'Yes'
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
                      team: 'No'
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


            {/* =========================================
                GITHUB
            ========================================== */}

            <div className="space-y-2">

              <Label htmlFor="github">
                Please give us your GitHub
              </Label>

              <Input
                id="github"
                value={form.github}
                onChange={setField('github')}
                placeholder="github.com/adalovelace"
                required
              />

            </div>


            {/* =========================================
                HIGH SCHOOL
            ========================================== */}

            <div className="space-y-2">

              <Label>
                You or your team need to be in high-school
                to participate. Are you in high school? *
              </Label>

              <label className="flex items-center gap-3 cursor-pointer">

                <input
                  type="checkbox"
                  checked={form.highSchool}
                  onChange={(e) =>
                    setForm((previous) => ({
                      ...previous,
                      highSchool: e.target.checked
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


            {/* =========================================
                SUPPLIES
            ========================================== */}

            <div className="space-y-2">

              <Label>
                You and your team need to bring your own
                supplies. Are you bringing your computer,
                charger, and anything you might need? *
              </Label>

              <label className="flex items-center gap-3 cursor-pointer">

                <input
                  type="checkbox"
                  checked={form.supplies}
                  onChange={(e) =>
                    setForm((previous) => ({
                      ...previous,
                      supplies: e.target.checked
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


            {/* =========================================
                HOW DID YOU HEAR ABOUT US?
            ========================================== */}

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


            {/* =========================================
                SUBMIT
            ========================================== */}

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
```
