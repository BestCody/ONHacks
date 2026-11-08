import { Link } from 'react-router-dom';
import { EVENT_DETAILS } from '@/eventDetails';
import { useScreenScale } from '@/hooks/useScreenScale';

const DOCUMENTS = {
  privacy: {
    title: 'Privacy Notice',
    intro:
      'This notice explains how ONHacks collects and uses information when you create an account, submit an application, or take part in the event.',
    sections: [
      {
        heading: 'Information we collect',
        paragraphs: [
          'We collect the information you provide in your account and application, including your name, email address, team status, GitHub profile, high-school confirmation, supplies confirmation, and how you heard about ONHacks.',
          'If you are accepted, we also collect the signed participant waiver you upload. It includes your date of birth, your emergency contact, your parent or guardian’s name and signature, and any medical information you choose to share.',
          'If you RSVP, we record when you confirmed your spot and create a meal QR code that appears on your participant pass and printed name badge. Organizers scan it at lunch and dinner to record your meals.',
          'After projects are submitted on Devpost, we use the team members’ email addresses in Devpost’s project export to match your team to your application and schedule your judging room and pitch time.',
          'We also keep technical information needed to secure the service, such as session and rate-limiting information.',
          'We use cookie-free Cloudflare Web Analytics to measure visits, page views, and website performance. It does not track individual visitors across websites.',
        ],
      },
      {
        heading: 'How we use it',
        paragraphs: [
          'We use this information to create and secure your account, process and review applications, communicate event details, prevent duplicate or abusive submissions, and operate the hackathon.',
          'We do not use application information for unrelated advertising or sell it to marketers.',
        ],
      },
      {
        heading: 'Access and service providers',
        paragraphs: [
          'Apart from the sponsor sharing described below, access is limited to the ONHacks organizing team and service providers that help us host, secure, and operate the website and database. Those providers may process information outside Canada.',
          `Uploaded waivers can only be viewed by the ONHacks organizing team. They are deleted from our website automatically ${EVENT_DETAILS.waiverRetentionDays} days after upload, and organizers delete any copies they download to check them by then.`,
          'We keep information only for as long as it is reasonably needed for application review, event operations, safety, legal, and security purposes, after which it is deleted or anonymized where practical.',
        ],
      },
      {
        heading: 'Sharing with sponsors',
        paragraphs: [
          'If your team wins a prize, we share your name and email address with the sponsor providing that prize so they can deliver it to you.',
          'Some sponsors give credits or perks to every participant. To deliver these, we share participants’ email addresses with those sponsors. You can ask us to leave you out of this sharing.',
          'We only share what is needed to deliver the prize or perk. Some sponsors are located outside Canada.',
        ],
      },
      {
        heading: 'Your choices and questions',
        paragraphs: [
          'You may ask to access or correct your information, request deletion where appropriate, or withdraw consent for uses that are not necessary to operate the event. Some requests may affect our ability to process your application.',
          'For privacy questions, or to opt out of sponsor sharing, email hello@onhacks.ca or contact the ONHacks organizing team through our official Instagram account: @onhacks_.',
        ],
      },
      {
        heading: 'Participants under 18',
        paragraphs: [
          'If you are under 13, ask a parent or legal guardian to review this notice and provide any consent required before submitting an application. Participants aged 13 to 17 should review it with a parent or guardian if they have questions. If you are under 18, a parent or guardian must also sign your participant waiver.',
        ],
      },
    ],
  },
  terms: {
    title: 'Participant Terms',
    intro:
      'By applying to ONHacks, you acknowledge these participation terms. Acceptance of an application is not guaranteed.',
    sections: [
      {
        heading: 'Eligibility and event format',
        paragraphs: [
          'ONHacks is a free, in-person, 12-hour hackathon for high-school students. Teams may have up to four people. You must provide accurate information and follow any instructions from the organizing team.',
        ],
      },
      {
        heading: 'Waiver and RSVP',
        paragraphs: [
          `If you are accepted, you must upload a signed participant waiver (also signed by a parent or guardian if you are under 18) and RSVP on your dashboard by ${EVENT_DETAILS.rsvpDeadlineLabel}. Only participants who RSVP receive an event pass and name badge.`,
        ],
      },
      {
        heading: 'Participation and safety',
        paragraphs: [
          'You agree to follow the venue rules, event schedule, safety instructions, and Code of Conduct. The organizing team may refuse or end participation when necessary to protect attendees, staff, volunteers, or the venue.',
        ],
      },
      {
        heading: 'Projects and submissions',
        paragraphs: [
          'You are responsible for your project and must have the right to use any code, media, data, or other materials included in it. You retain ownership of work you create, subject to the licenses of any third-party materials you use.',
        ],
      },
      {
        heading: 'Changes and communication',
        paragraphs: [
          'Event details, timing, venue arrangements, and participation requirements may change. We will use the contact information in your application for important event communications.',
        ],
      },
    ],
  },
  conduct: {
    title: 'Code of Conduct',
    intro:
      'ONHacks is intended to be a welcoming, respectful, and safe event for everyone.',
    sections: [
      {
        heading: 'Expected behaviour',
        paragraphs: [
          'Treat participants, organizers, mentors, sponsors, volunteers, and venue staff with respect. Collaborate in good faith, give credit for outside work, and help create an environment where people of different backgrounds and experience levels can participate.',
        ],
      },
      {
        heading: 'Unacceptable behaviour',
        paragraphs: [
          'Harassment, discrimination, intimidation, threats, unwanted sexual attention, hate speech, vandalism, unsafe conduct, illegal activity, and misuse of another person’s data or work are not allowed.',
        ],
      },
      {
        heading: 'Reporting and response',
        paragraphs: [
          'If you experience or witness a concern, tell an organizer or trusted event staff member as soon as possible. Reports will be handled as discreetly as practical. The organizing team may investigate, ask someone to stop a behaviour, remove someone from the event, or contact emergency services when necessary.',
        ],
      },
    ],
  },
};

export default function LegalPage({ document = 'privacy' }) {
  useScreenScale();
  const content = DOCUMENTS[document] || DOCUMENTS.privacy;

  return (
    <main className="min-h-screen bg-[#f8fafc] px-4 py-10 text-[#0A1A2A] sm:py-16">
      <article className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-xl sm:p-10">
        <Link
          to="/apply"
          className="mb-8 inline-flex text-sm font-semibold text-[#0A1A2A] underline underline-offset-4 hover:text-[#FF2E2E]"
        >
          Back to application
        </Link>

        <h1 className="font-bubbly text-4xl text-[#FF2E2E] sm:text-5xl">
          {content.title}
        </h1>
        <p className="mt-4 text-base leading-7 text-black/70">{content.intro}</p>

        <div className="mt-8 space-y-8">
          {content.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-bungee text-lg text-[#0A1A2A]">{section.heading}</h2>
              <div className="mt-2 space-y-3 text-sm leading-7 text-black/70 sm:text-base">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
