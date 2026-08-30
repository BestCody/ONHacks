import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { ArrowLeft, Loader2, Send } from "lucide-react";

/* =====================================================
   GOOGLE FORM
   ===================================================== */

const GOOGLE_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLScjVOvcX4mo0q_tCHkfDX7-h-qtPhXiPGDei7XttNhj0QojAA/formResponse";

/* =====================================================
   GOOGLE FORM QUESTION IDs
   ===================================================== */

const ENTRY = {
  name: "entry.2034160097",
  team: "entry.1501179330",
  github: "entry.229203195",
  highSchool: "entry.1740451237",
  supplies: "entry.1883098233",
  heardAbout: "entry.1851102738",
};

/* =====================================================
   BACKGROUND
   ===================================================== */

const BG = "/assets/apply-bg.webp";

/* =====================================================
   APPLICATION PAGE
   ===================================================== */

export default function Apply() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    team: "",
    github: "",
    highSchool: false,
    supplies: false,
    heardAbout: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  /* ===================================================
     UPDATE TEXT INPUTS
     =================================================== */

  const setField = (field) => (event) => {
    setForm((previous) => ({
      ...previous,
      [field]: event.target.value,
    }));
  };

  /* ===================================================
     SUBMIT REGISTRATION
     =================================================== */

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");

    /* Validate required questions */

    if (!form.firstName.trim()) {
      setError("Please enter your first name.");
      return;
    }

    if (!form.lastName.trim()) {
      setError("Please enter your last name.");
      return;
    }

    if (!form.team) {
      setError("Please select whether you are with a team.");
      return;
    }

    if (!form.github.trim()) {
      setError("Please enter your GitHub username.");
      return;
    }

    if (!form.highSchool) {
      setError(
        "You must confirm that you are in high school to participate."
      );
      return;
    }

    if (!form.supplies) {
      setError(
        "Please confirm that you will bring your computer, charger, and necessary supplies."
      );
      return;
    }

    if (!form.heardAbout.trim()) {
      setError("Please tell us how you heard about us.");
      return;
    }

    setLoading(true);

    try {
      /* Combine first and last name */

      const fullName =
        `${form.firstName.trim()} ${form.lastName.trim()}`;

      /* Create Google Form submission */

      const formData = new FormData();

      formData.append(ENTRY.name, fullName);
      formData.append(ENTRY.team, form.team);
      formData.append(ENTRY.github, form.github.trim());
      formData.append(ENTRY.highSchool, "YES");
      formData.append(ENTRY.supplies, "YES");
      formData.append(
        ENTRY.heardAbout,
        form.heardAbout.trim()
      );

      /* Send answers to Google Forms */

      await fetch(GOOGLE_FORM_URL, {
        method: "POST",
        mode: "no-cors",
        body: formData,
      });

      /* Show success screen */

      setDone(true);
    } catch (err) {
      console.error(err);

      setError(
        "Something went wrong while submitting. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  /* ===================================================
     SUCCESS PAGE
     =================================================== */

  if (done) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{
          backgroundImage: `url(${BG})`,
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundColor: "#321816",
        }}
      >
        <div className="max-w-md w-full text-center bg-white rounded-2xl shadow-xl p-10">

          <div className="text-6xl mb-5">
            🎉
          </div>

          <h2 className="font-bubbly text-4xl text-[#FF2E2E] mb-3">
            You're in!
          </h2>

          <p className="text-black/70 mb-8 leading-relaxed">
            Thanks for filling the form :) <br />
            We received your registration and can't wait
            to see you at the hackathon!
          </p>

          <Button
            onClick={() => navigate("/")}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            Back to home
          </Button>

        </div>
      </div>
    );
  }

  /* ===================================================
     REGISTRATION PAGE
     =================================================== */

  return (
    <div
      className="min-h-screen py-12 px-4"
      style={{
        backgroundImage: `url(${BG})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: "#321816",
      }}
    >
      <div className="max-w-xl mx-auto">

        {/* BACK BUTTON */}

        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-white/90 hover:text-white mb-6 text-sm font-medium drop-shadow"
        >
          <ArrowLeft size={16} />
          Back home
        </button>

        {/* FORM CARD */}

        <div className="bg-white rounded-2xl shadow-xl p-8">

          {/* HEADER */}

          <h1 className="font-bubbly text-4xl text-[#0A1A2A] mb-2">
            Hackathon Registration
          </h1>

          <p className="text-black/60 mb-8">
            Fill out the form below to register for our
            hackathon!
          </p>

          {/* ERROR MESSAGE */}

          {error && (
            <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* FORM */}

          <form
            onSubmit={handleSubmit}
            className="space-y-6"
          >

            {/* =========================================
                NAME
            ========================================== */}

            <div className="space-y-2">

              <Label>
                First name and last name *
              </Label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                <Input
                  value={form.firstName}
                  onChange={setField("firstName")}
                  placeholder="First name"
                  required
                />

                <Input
                  value={form.lastName}
                  onChange={setField("lastName")}
                  placeholder="Last name"
                  required
                />

              </div>

            </div>

            {/* =========================================
                TEAM
            ========================================== */}

            <div className="space-y-2">

              <Label>
                Are you with a team? *
              </Label>

              <div className="grid grid-cols-2 gap-3">

                <button
                  type="button"
                  onClick={() =>
                    setForm((previous) => ({
                      ...previous,
                      team: "Yes",
                    }))
                  }
                  className={`
                    h-12 rounded-lg border font-medium
                    transition
                    ${
                      form.team === "Yes"
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-white border-gray-300 text-gray-800 hover:border-blue-500"
                    }
                  `}
                >
                  Yes
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setForm((previous) => ({
                      ...previous,
                      team: "No",
                    }))
                  }
                  className={`
                    h-12 rounded-lg border font-medium
                    transition
                    ${
                      form.team === "No"
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-white border-gray-300 text-gray-800 hover:border-blue-500"
                    }
                  `}
                >
                  No
                </button>

              </div>

            </div>

            {/* =========================================
                GITHUB
            ========================================== */}

            <div className="space-y-2">

              <Label htmlFor="github">
                Please give us your GitHub *
              </Label>

              <Input
                id="github"
                value={form.github}
                onChange={setField("github")}
                placeholder="Your GitHub username"
                required
              />

              <p className="text-xs text-black/50">
                Enter your GitHub username only.
              </p>

            </div>

            {/* =========================================
                HIGH SCHOOL
            ========================================== */}

            <div className="space-y-3">

              <Label>
                You or your team need to be in high school
                to participate. Are you in high school? *
              </Label>

              <label className="flex items-center gap-3 p-4 rounded-lg border border-gray-300 cursor-pointer hover:border-blue-500 transition">

                <input
                  type="checkbox"
                  checked={form.highSchool}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      highSchool: event.target.checked,
                    }))
                  }
                  required
                  className="w-5 h-5 accent-blue-600"
                />

                <span className="text-sm text-gray-800">
                  Yes
                </span>

              </label>

            </div>

            {/* =========================================
                SUPPLIES
            ========================================== */}

            <div className="space-y-3">

              <Label>
                You and your team need to bring your own
                supplies. Are you bringing your computer,
                charger, and anything you might need? *
              </Label>

              <label className="flex items-center gap-3 p-4 rounded-lg border border-gray-300 cursor-pointer hover:border-blue-500 transition">

                <input
                  type="checkbox"
                  checked={form.supplies}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      supplies: event.target.checked,
                    }))
                  }
                  required
                  className="w-5 h-5 accent-blue-600"
                />

                <span className="text-sm text-gray-800">
                  Yes
                </span>

              </label>

            </div>

            {/* =========================================
                HOW DID YOU HEAR ABOUT US?
            ========================================== */}

            <div className="space-y-2">

              <Label htmlFor="heardAbout">
                How did you hear about us? (say in short) *
              </Label>

              <Input
                id="heardAbout"
                value={form.heardAbout}
                onChange={setField("heardAbout")}
                placeholder="Instagram, school, friend..."
                required
              />

            </div>

            {/* =========================================
                SUBMIT BUTTON
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
                  Submit Registration
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
