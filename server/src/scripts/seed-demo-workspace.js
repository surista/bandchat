#!/usr/bin/env node
/**
 * Seed a demo workspace "Lunar Moth" with realistic indie/alt band data.
 *
 * Usage:
 *   node src/scripts/seed-demo-workspace.js           # Create demo workspace
 *   node src/scripts/seed-demo-workspace.js --clean    # Delete existing and re-create
 *
 * Login: alex@demo.bandchat.app / Demo1234
 */

import 'dotenv/config';
import prisma from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const WORKSPACE_NAME = 'Lunar Moth';
const DEMO_PASSWORD = 'Demo1234';

// ============================================================
// DATA DEFINITIONS
// ============================================================

const MEMBERS = [
  { email: 'alex@demo.bandchat.app', displayName: 'Alex Rivera', role: 'ADMIN', instruments: ['Guitar', 'Vocals'], avatarUrl: 'https://api.dicebear.com/9.x/adventurer/svg?seed=Alex&backgroundColor=b6e3f4' },
  { email: 'sam@demo.bandchat.app', displayName: 'Sam Chen', role: 'MEMBER', instruments: ['Bass'], avatarUrl: 'https://api.dicebear.com/9.x/adventurer/svg?seed=Sam&backgroundColor=d1d4f9' },
  { email: 'jordan@demo.bandchat.app', displayName: 'Jordan Blake', role: 'MEMBER', instruments: ['Drums', 'Percussion'], avatarUrl: 'https://api.dicebear.com/9.x/adventurer/svg?seed=Jordan&backgroundColor=c0aede' },
  { email: 'taylor@demo.bandchat.app', displayName: 'Taylor Kim', role: 'MEMBER', instruments: ['Keys', 'Synth', 'Backing Vocals'], avatarUrl: 'https://api.dicebear.com/9.x/adventurer/svg?seed=Taylor&backgroundColor=ffd5dc' },
];

const SONGS = [
  { title: 'Pale Satellite', key: 'Em', bpm: 128, duration: 234, notes: 'Open with this one. Big reverb intro.', lyrics: 'Spinning out past the atmosphere\nA pale satellite draws near\nCan you see me from where you are\nJust another falling star' },
  { title: 'Midnight Architecture', key: 'Am', bpm: 118, duration: 267, notes: 'Build slowly, drops at 1:30', lyrics: 'Building castles in the air\nMidnight architecture everywhere' },
  { title: 'Glass Horizon', key: 'C', bpm: 135, duration: 198, notes: 'Festival opener energy', arrangement: 'Intro (8 bars keys) → Verse → Pre → Chorus → Verse → Pre → Chorus → Bridge (half-time) → Final Chorus (double)' },
  { title: 'Tidal', key: 'F#m', bpm: 96, duration: 285, notes: 'Slow burn. Let it breathe.', lyrics: 'The tide comes in and washes away\nEverything we built today\nBut tomorrow we start again' },
  { title: 'Neon Prayers', key: 'Dm', bpm: 142, duration: 210, notes: 'High energy. Synth lead.', arrangement: 'Synth intro → Verse (guitar clean) → Chorus (full band) → Break (bass solo 8 bars) → Final chorus' },
  { title: 'The Cartographer', key: 'G', bpm: 108, duration: 252, notes: 'Acoustic version works well too' },
  { title: 'Dissolve', key: 'Bb', bpm: 120, duration: 224, notes: 'Key change in bridge to C' },
  { title: 'Phantom Limb', key: 'A', bpm: 145, duration: 195, notes: 'Punk-influenced. Fast and tight.' },
  { title: 'Weight of Light', key: 'D', bpm: 92, duration: 298, notes: 'Closer material. Very emotional.', lyrics: 'I carry the weight of light\nThrough every sleepless night\nBut dawn is just a dream away' },
  { title: 'Corridor', key: 'Cm', bpm: 130, duration: 218, notes: 'Post-punk vibes' },
  { title: 'Static Garden', key: 'E', bpm: 112, duration: 245, notes: 'Layered vocals in chorus' },
  { title: 'Undertow', key: 'Bm', bpm: 138, duration: 206, notes: 'Great live energy' },
  { title: 'Paper Meridian', key: 'F', bpm: 104, duration: 270, notes: 'Complex time signature changes in bridge' },
  { title: 'Flicker', key: 'Ab', bpm: 155, duration: 188, notes: 'Short and punchy. Encore material.' },
  { title: 'Vanishing Point', key: 'Em', bpm: 100, duration: 310, notes: 'Longest song. Epic build.', arrangement: '4-part structure: Ambient intro (1:00) → Verse/Chorus (2:00) → Breakdown (1:30) → Crescendo outro (0:40)' },
  { title: 'Soft Collision', key: 'C#m', bpm: 116, duration: 232, notes: 'Newest song. Still workshopping the bridge.' },
  { title: 'Radio Silence', key: 'G', bpm: 126, duration: 214 },
  { title: 'Afterglow', key: 'D', bpm: 98, duration: 256, notes: 'Beautiful keys intro from Taylor' },
  { title: 'The Long Way Home', key: 'A', bpm: 110, duration: 242, notes: 'Crowd singalong in final chorus' },
  { title: 'Lucid', key: 'Eb', bpm: 148, duration: 192, notes: 'Dance-y. Good for late in the set.' },
];

const VENUES = [
  { title: 'The Echo Room', venue: 'The Echo Room', address: '412 Spring St', pay: 350 },
  { title: 'Velvet Underground', venue: 'Velvet Underground', address: '225 Division Ave', pay: 200 },
  { title: 'Moonlight Festival', venue: 'Riverside Park - Main Stage', address: 'Riverside Park', pay: 500 },
  { title: 'The Basement Show', venue: "Tony's Basement", address: '88 Oak Lane', pay: 150 },
  { title: 'Record Store Day', venue: 'Wax & Wane Records', address: '15 Market St', pay: 0 },
  { title: 'Lunar Moth at The Depot', venue: 'The Depot', address: '900 Railroad Ave', pay: 400 },
  { title: 'New Years Eve Show', venue: 'The Echo Room', address: '412 Spring St', pay: 450 },
  { title: 'Spring Showcase', venue: 'The Catalyst', address: '1011 Pacific Ave', pay: 300 },
  { title: 'Summer Solstice Fest', venue: 'Oakwood Amphitheater', address: '500 Amphitheater Dr', pay: 600 },
  { title: 'Album Release Party', venue: 'The Glass House', address: '200 W 2nd St', pay: 0 },
];

const CONTACTS = [
  { name: 'Mike Torres', category: 'agent', email: 'mike@echobooking.com', phone: '555-0101', notes: 'Books The Echo Room and The Depot. Responds best to email.' },
  { name: 'Dave Kowalski', category: 'sound_engineer', email: 'dave.k@soundpro.net', phone: '555-0202', notes: 'Freelance. $200/night. Has his own PA for small venues.' },
  { name: 'Rina Patel', category: 'photographer', email: 'rina@rinapatel.com', website: 'https://rinapatel.com', notes: 'Shot our EP promo photos. $150/session.' },
  { name: 'Jam Space Studios', category: 'venue', email: 'bookings@jamspace.co', phone: '555-0303', address: '77 Industrial Blvd, Unit 4', notes: 'Our rehearsal space. $25/hr, $80 for 4hrs.' },
  { name: 'Print Punk', category: 'other', email: 'orders@printpunk.com', website: 'https://printpunk.com', notes: 'Merch printing. 2-week turnaround. Min order 50 shirts.' },
];

const TIMELINE_EVENTS = [
  { eventType: 'formation', title: 'Lunar Moth formed', description: 'Alex, Sam, Jordan, and Chris start jamming in a garage. The name comes from a late-night conversation about things that are beautiful but short-lived.', eventDate: new Date('2024-06-15') },
  { eventType: 'first_gig', title: 'First gig at The Basement', description: 'Played to about 20 people in Tony\'s basement. Mostly friends but the energy was incredible.', eventDate: new Date('2024-09-20') },
  { eventType: 'member_left', title: 'Chris leaves the band', description: 'Chris Nakamura departs over creative differences. Wanted to go heavier, rest of the band leaning indie/dreampop. No hard feelings — still comes to shows.', eventDate: new Date('2024-10-15') },
  { eventType: 'member_joined', title: 'Taylor joins the band', description: 'Taylor Kim joins on keys/synth after sitting in on a rehearsal. Immediately brings a new dimension to the sound. The lineup finally clicks.', eventDate: new Date('2024-11-01') },
  { eventType: 'milestone', title: 'Morgan fills in on guitar', description: 'Morgan Ellis (friend of Sam) guests on rhythm guitar for two shows while Alex recovers from a hand injury. Kills it both nights.', eventDate: new Date('2025-03-10') },
  { eventType: 'milestone', title: 'First festival set', description: 'Played the Moonlight Festival main stage to 200+ people. Biggest crowd yet.', eventDate: new Date('2025-07-12') },
  { eventType: 'album_release', title: '"Pale Satellite" EP released', description: '5-track EP released on Bandcamp and streaming. Recorded at Jam Space Studios over 3 weekends.', eventDate: new Date('2025-10-01') },
  { eventType: 'member_joined', title: 'Chris rejoins as touring member', description: 'Chris Nakamura comes back as a part-time touring member for bigger shows. Plays rhythm guitar and adds backing vocals. The five-piece sound is massive.', eventDate: new Date('2026-01-15') },
];

// Message templates per channel — realistic conversations
const CHANNEL_MESSAGES = {
  general: [
    { author: 0, content: 'Hey everyone, welcome to BandChat! This is way better than our old group text 😄' },
    { author: 1, content: 'Finally! No more scrolling through 500 messages to find the rehearsal time' },
    { author: 2, content: 'This is sick. Can we get a channel just for memes?' },
    { author: 0, content: 'Already made #random for that 😂' },
    { author: 3, content: 'Just joined! This is Taylor btw. Excited to be part of this.' },
    { author: 0, content: 'Welcome Taylor!! So glad you\'re in. Your keys on Tidal last week were unreal.' },
    { author: 1, content: '+1, that session was magical' },
    { author: 2, content: 'Taylor you made us sound like a real band for the first time lol' },
    { author: 3, content: 'Haha thanks everyone ❤️ I\'ve been working on some synth patches that might work for Neon Prayers too' },
    { author: 0, content: 'Oh hell yes. Bring those to rehearsal Thursday?' },
    { author: 3, content: 'Will do!' },
    { author: 1, content: 'Anyone see that Radiohead documentary on Netflix? So good.' },
    { author: 2, content: 'Watched it twice already. The OK Computer sessions are insane' },
    { author: 0, content: 'The way they layer sounds... goals honestly' },
    { author: 3, content: 'Thom Yorke\'s approach to melody is something else. I keep trying to steal his chord voicings 😅' },
    { author: 1, content: 'Speaking of which, has anyone heard the new Fontaines D.C. album?' },
    { author: 2, content: 'YES. "Starburster" is on repeat. That groove.' },
    { author: 0, content: 'Added it to the shared playlist' },
    { author: 1, content: 'Hey quick reminder — we need to get band photos done before the EP release' },
    { author: 0, content: 'Rina Patel said she can do next Saturday morning at the old warehouse district' },
    { author: 2, content: 'Works for me' },
    { author: 3, content: 'Same! Should we coordinate outfits or go casual?' },
    { author: 0, content: 'I think casual but moody? Like wear dark colors but make it look effortless' },
    { author: 1, content: 'So... exactly what we always wear 😂' },
    { author: 2, content: 'Perfect' },
    { author: 0, content: 'Just got off the phone with Mike at Echo Room — they want us back next month!' },
    { author: 1, content: 'LET\'S GO!! That venue sounds so good' },
    { author: 2, content: '🔥🔥🔥' },
    { author: 3, content: 'The reverb in that room is perfect for our sound' },
    { author: 0, content: 'Right? I\'ll confirm the date and post in #gig-planning' },
    { author: 1, content: 'Guys I think we should start thinking about recording a full album' },
    { author: 0, content: 'I\'ve been thinking the same thing. We have enough material for sure' },
    { author: 2, content: 'We need to figure out budget first. Studio time isn\'t cheap' },
    { author: 3, content: 'What about doing it ourselves? We could rent Jam Space for a week and I have decent recording gear' },
    { author: 1, content: 'That could actually work. The EP sounded great and we did that in like 3 sessions' },
    { author: 0, content: 'Let\'s put together some numbers and discuss at rehearsal' },
    { author: 2, content: 'Practice tomorrow at 7 right?' },
    { author: 0, content: 'Yep, Jam Space, 7pm. Bring your double kick pedal, I want to try something on Phantom Limb' },
    { author: 2, content: 'Ooh interesting. Will do.' },
    { author: 3, content: 'Should I bring the Nord or is the house keyboard fine?' },
    { author: 1, content: 'Bring the Nord, the house one has dead keys' },
    { author: 3, content: 'Copy that 👍' },
    { author: 0, content: 'Just saw we got a review on the local blog!! They called us "the most promising new act in the scene"' },
    { author: 1, content: 'NO WAY. Link??' },
    { author: 0, content: 'https://localmusicblog.example.com/lunar-moth-review — they specifically mention the EP and the Moonlight Festival set' },
    { author: 2, content: 'This is amazing. We should share this on all our socials' },
    { author: 3, content: 'Already shared on my story 📱' },
    { author: 1, content: 'I\'m literally grinning right now' },
    { author: 0, content: 'We\'re getting there, team. Step by step. 🦋' },
    { author: 2, content: 'Moth by moth 🤘' },
    { author: 1, content: 'lmao Jordan' },
    { author: 0, content: 'Hey can everyone fill out their availability for April? I\'m trying to book some shows' },
    { author: 1, content: 'Done ✅' },
    { author: 2, content: 'Done. I\'m away the 15th-17th for my sister\'s wedding' },
    { author: 3, content: 'Filled in! I\'m free most weekends' },
    { author: 0, content: 'Perfect, thanks everyone' },
    { author: 1, content: 'Anyone want to do a songwriting session this weekend? I have some riff ideas' },
    { author: 3, content: 'I\'m down! Saturday afternoon?' },
    { author: 0, content: 'Count me in' },
    { author: 2, content: 'I\'ll bring the cajon for something low-key' },
    { author: 0, content: 'Love that idea. Sam\'s place?' },
    { author: 1, content: 'Works for me. I\'ll order pizza 🍕' },
    { author: 3, content: '🎵🍕 my two favorite things' },
    { author: 0, content: 'Merch update: Print Punk sent the shirt proofs. Check the attachment in #gig-planning' },
    { author: 2, content: 'The moth design came out so good' },
    { author: 1, content: 'Can we also do stickers? Everyone loves stickers' },
    { author: 0, content: 'Already on it. 3" die-cut moths. $50 for 200.' },
    { author: 3, content: 'That\'s a no-brainer' },
    { author: 0, content: 'Alright team, big announcement coming tomorrow. Stay tuned 👀' },
    { author: 1, content: 'Don\'t do this to us Alex' },
    { author: 2, content: 'THE SUSPENSE' },
    { author: 3, content: '👀👀👀' },
    { author: 0, content: 'OK I can\'t wait — we got offered a support slot opening for Slow Dive at The Catalyst!!!' },
    { author: 1, content: 'WHAT. WHAT. WHAT.' },
    { author: 2, content: 'I\'m literally shaking' },
    { author: 3, content: 'This is a dream. Is this real?' },
    { author: 0, content: 'It\'s real!! May 15th. 500 cap venue. We get 30 minutes.' },
    { author: 1, content: 'We need to absolutely nail our setlist for this' },
    { author: 0, content: 'Starting a thread in #setlists right now' },
    { author: 2, content: 'Best band meeting ever honestly' },
    { author: 3, content: '🦋🦋🦋🦋' },
    { author: 0, content: 'I booked us into Jam Space this Saturday for a full day. 10am-6pm. Deep dive on the new material.' },
    { author: 1, content: 'Perfect timing. I\'ve been working on a new bass line for Soft Collision' },
    { author: 2, content: 'Bring snacks. Last time we forgot and almost died by hour 4' },
    { author: 3, content: 'I\'ll bring coffee and bagels for the morning 🥯' },
    { author: 0, content: 'Team player right there ^^' },
    { author: 1, content: 'Reminder: social media posts! We should be posting at least 2-3x a week' },
    { author: 0, content: 'Good call. I\'ll do a rehearsal recap video tonight' },
    { author: 2, content: 'I got some cool slow-mo footage of my cymbal hits last rehearsal' },
    { author: 3, content: 'I can edit stuff together if people send me clips' },
    { author: 0, content: 'Taylor you\'re officially our content manager 😄' },
    { author: 3, content: 'I accept this role with great honor and zero extra pay' },
    { author: 1, content: '😂😂' },
    { author: 0, content: 'End of month recap: 3 gigs played, EP streaming numbers up 40%, 2 new songs written. We\'re killing it.' },
    { author: 1, content: 'Honestly so proud of this band' },
    { author: 2, content: 'From a garage to opening for Slow Dive in less than a year. Wild.' },
    { author: 3, content: 'Best decision I ever made, joining you weirdos' },
    { author: 0, content: '❤️ Onwards and upwards, moths' },
    { author: 0, content: 'Quick poll: should we add a cover to our sets? Some bookers like seeing one.' },
    { author: 1, content: 'Only if it\'s something we can make our own' },
    { author: 2, content: 'What about "Just Like Heaven" by The Cure? Fits our vibe' },
    { author: 3, content: 'Ooh or "Bizarre Love Triangle" — I could do a cool synth arrangement' },
    { author: 0, content: 'Both great options. I\'ll make a poll' },
    { author: 1, content: 'Love that we actually vote on things now instead of arguing for 2 hours' },
    { author: 2, content: 'Democracy rocks' },
    { author: 0, content: 'New string day 🎸 Got the Ernie Ball Paradigms. These better last longer than the regular Slinkys.' },
    { author: 1, content: 'Let me know how they feel! I\'ve been thinking about switching from Rotosound' },
    { author: 2, content: 'Evans UV2 heads just came in too. My toms are going to sound SO good' },
    { author: 3, content: 'I love new gear day. It\'s like Christmas for musicians 🎄' },
    { author: 0, content: 'Updated the practice log — we\'ve logged 45 hours collectively this month!' },
    { author: 2, content: 'No wonder we sound tighter than ever' },
    { author: 1, content: 'The practice dashboard on here is actually really motivating' },
    { author: 3, content: 'I may have stayed up until 2am learning the bridge on Vanishing Point 😅' },
    { author: 0, content: 'Dedication! But also please sleep, Taylor' },
    { author: 3, content: 'Sleep is for bands that don\'t have a Slow Dive support slot to prepare for 💪' },
  ],
  songwriting: [
    { author: 0, content: 'I\'ve been noodling on this chord progression all morning: Em - Cmaj7 - G - D/F#. Feels like it could be something.' },
    { author: 3, content: 'Oh I love that Cmaj7 in there. What if I added some ambient pad underneath?' },
    { author: 0, content: 'Yes! Something shimmery. Like the intro to "Everything In Its Right Place" but more organic' },
    { author: 1, content: 'I could do a walking bassline under that. Ascending from E to G?' },
    { author: 0, content: 'Try it. Let\'s workshop this Thursday' },
    { author: 2, content: 'What tempo are we thinking? If it\'s slow I could do brushes' },
    { author: 0, content: 'Around 95bpm. Slow burn vibes. This might become the next Tidal.' },
    { author: 3, content: 'Here\'s a lyric fragment I\'ve been sitting on: "We build our houses out of sound / and watch them echo to the ground"' },
    { author: 0, content: 'That\'s beautiful. Can I try writing a verse around that?' },
    { author: 3, content: 'All yours!' },
    { author: 1, content: 'What if the chorus lifts with a key change? Like to G major?' },
    { author: 0, content: 'The Radiohead move! I\'m into it' },
    { author: 2, content: 'I have a beat idea that might work — kind of a motorik thing but with ghost notes on the hi-hat' },
    { author: 0, content: 'Record a voice memo and post it?' },
    { author: 2, content: 'Done. Check this out — imagine this at 95bpm with that chord progression' },
    { author: 3, content: '🔥 that groove is PERFECT' },
    { author: 0, content: 'OK this song is writing itself. Thursday can\'t come fast enough.' },
    { author: 1, content: 'Naming ideas? I keep thinking "Glass Houses" but that\'s too obvious' },
    { author: 0, content: 'What about "Soft Collision"? Like the sound meeting silence.' },
    { author: 3, content: 'Soft Collision. I love it. ✨' },
    { author: 2, content: 'Working title approved. Let\'s see how it evolves' },
    { author: 0, content: 'New idea: what if we write something in 7/8? I know it\'s weird but Paper Meridian proved we can do odd time' },
    { author: 2, content: 'I\'m always down for weird time signatures. My drum teacher would be proud' },
    { author: 1, content: 'As long as I can find the groove I\'m in. 7/8 bass is tricky but doable' },
    { author: 3, content: 'I could anchor it with a repeating piano figure — like a Philip Glass thing but with more dirt' },
    { author: 0, content: 'Yes yes yes. Let me sketch something out this weekend.' },
    { author: 1, content: 'Speaking of lyrics — I was reading some Mary Oliver poems and got inspired. What if we wrote something nature-themed?' },
    { author: 0, content: 'Our band IS named after an insect so... yeah that tracks 😄' },
    { author: 3, content: 'I\'ve always wanted to write a song about the ocean. "Undertow" kind of touches on it but not directly' },
    { author: 2, content: 'Tidal too. We have a water theme going apparently' },
    { author: 0, content: 'Lunar Moth. Pale Satellite. Tidal. Undertow. We\'re basically a nature documentary soundtrack' },
    { author: 1, content: 'And I\'m here for it 🌊' },
    { author: 0, content: 'OK real talk — I think "Flicker" needs a rewrite. The verse melody is too similar to Glass Horizon.' },
    { author: 3, content: 'Agreed. The chorus is great though. Can we keep that and redo the verse?' },
    { author: 1, content: 'What if the verse was more sparse? Like just bass and vocals?' },
    { author: 0, content: 'Ooh. Stripped back verse, big chorus. Classic quiet-loud dynamic.' },
    { author: 2, content: 'I can come in with the full kit on the chorus. Explosive.' },
    { author: 0, content: 'Let\'s try this arrangement at rehearsal. I think it\'ll transform the song.' },
    { author: 3, content: 'Wrote a piano part for Afterglow last night. It\'s in D major, very dreamy, lots of sustained notes with the damper pedal.' },
    { author: 0, content: 'Can\'t wait to hear it. That song needed a proper intro.' },
    { author: 1, content: 'The way Afterglow builds is one of my favorite things we do' },
    { author: 2, content: 'It\'s the song that made me want to join this band honestly' },
    { author: 3, content: '🥹 ok I\'m emotional now' },
    { author: 0, content: 'SETLIST IDEA: What if we rearrange the live set to tell a story? Start with Pale Satellite (beginning), build through the middle, end with Weight of Light (emotional peak) then Lucid as an encore (release)' },
    { author: 1, content: 'That\'s a really intentional arc. I like it.' },
    { author: 2, content: 'We\'d need to think about key transitions between songs though' },
    { author: 3, content: 'I can handle transitions with synth pads between songs. Seamless.' },
    { author: 0, content: 'This is going to be incredible live. Let\'s map it out in #setlists' },
    { author: 0, content: 'Update on Soft Collision: I finished the lyrics. 3 verses, chorus, bridge. It\'s about two people who keep almost connecting but never quite do.' },
    { author: 3, content: 'That metaphor works on so many levels. Can you post the lyrics?' },
    { author: 0, content: 'Posted them in the song notes. Check it out and let me know what you think.' },
    { author: 1, content: 'Just read them. The bridge is incredible. "We\'re parallel lines in a curved universe / destined to meet where the math doesn\'t work"' },
    { author: 2, content: 'OK that line hits different' },
    { author: 3, content: 'I want to put SO much reverb on that bridge. Like cathedral-level reverb.' },
    { author: 0, content: 'Done. Cathedral reverb it is. 🏛️' },
    { author: 1, content: 'Random thought: should we try writing a song collaboratively? Like, each person writes one section?' },
    { author: 0, content: 'That\'s actually how Corridor started and it\'s one of our best' },
    { author: 2, content: 'I call the bridge. I have a drum pattern that needs a home' },
    { author: 3, content: 'I\'ll take the intro. I have synth ideas burning a hole in my brain' },
    { author: 1, content: 'Verse for me then. Alex gets the chorus?' },
    { author: 0, content: 'Deal. Let\'s each bring our part to Thursday\'s rehearsal. No peeking at each other\'s work until then.' },
    { author: 2, content: 'This is going to be either amazing or a complete disaster' },
    { author: 0, content: 'That\'s rock and roll baby 🤘' },
  ],
  'gig-planning': [
    { author: 0, content: 'OK team, I\'ve been reaching out to venues. Here\'s where we stand:' },
    { author: 0, content: '- The Echo Room: interested, wants to see us live first\n- The Depot: available March 15, $400 guarantee\n- Velvet Underground: waitlisted for their indie night' },
    { author: 1, content: 'The Depot offer is solid. $400 guarantee is great for our level' },
    { author: 2, content: 'What\'s the capacity at The Depot?' },
    { author: 0, content: '150. They do their own sound and have a decent PA.' },
    { author: 3, content: 'I played there with my old band. Good vibe, good crowd. I say we take it.' },
    { author: 0, content: 'Done. I\'ll confirm with Mike. Everyone mark March 15 on your calendars.' },
    { author: 1, content: 'What time is load-in?' },
    { author: 0, content: 'Mike says doors at 8, we go on at 9:30. Load in at 7.' },
    { author: 2, content: 'Can we get a sound check at 7:30? I need to mic the kick properly this time' },
    { author: 0, content: 'I\'ll ask. Usually they give 20 minutes for sound check' },
    { author: 3, content: 'I\'ll need a DI box for the Nord. Does the venue have one or should I bring mine?' },
    { author: 0, content: 'Bring yours to be safe' },
    { author: 1, content: 'What about merch? Should we bring shirts to sell?' },
    { author: 0, content: 'Definitely. I\'ll bring 30 shirts, some stickers, and the EP on USB drives' },
    { author: 2, content: 'USB drives? That\'s very 2005 of you 😂' },
    { author: 0, content: 'People love it! Physical media nostalgia is real' },
    { author: 3, content: 'I actually think that\'s cool. Very on brand for us.' },
    { author: 0, content: 'Festival application update: I submitted us for Moonlight Festival, Riverside Sounds, and Indie Fest.' },
    { author: 1, content: 'When do we hear back?' },
    { author: 0, content: 'Moonlight says mid-April. Others didn\'t specify.' },
    { author: 2, content: 'Fingers crossed for Moonlight. That would be huge for us.' },
    { author: 3, content: '🤞🤞🤞' },
    { author: 0, content: 'WE GOT MOONLIGHT FESTIVAL! Main stage, Saturday 4pm slot! 🎉🎉🎉' },
    { author: 1, content: 'YESSSSSS' },
    { author: 2, content: 'I am literally screaming right now' },
    { author: 3, content: 'This is the biggest thing that\'s ever happened to us!!' },
    { author: 0, content: 'They\'re paying $500 plus we can sell merch. July 12th.' },
    { author: 1, content: 'We need to rehearse like crazy before this. Our tightest set ever.' },
    { author: 0, content: '100%. I\'m adding extra rehearsals to the calendar.' },
    { author: 2, content: 'What\'s the stage setup? In-ear monitors or wedges?' },
    { author: 0, content: 'They provide wedge monitors and full PA. We just bring instruments and pedalboards.' },
    { author: 3, content: 'Wait do they have a keyboard? Or should I bring the Nord?' },
    { author: 0, content: 'Bring it. Festival stages can be unpredictable with gear.' },
    { author: 0, content: 'Post-gig debrief from The Depot show:' },
    { author: 0, content: '✅ Sound was great\n✅ Good crowd (~100 people)\n✅ Sold 12 shirts and all the stickers\n❌ We ran 3 minutes over our slot\n❌ The transition from Corridor to Neon Prayers was rough' },
    { author: 1, content: 'We need to tighten those transitions. Maybe cut the banter between songs?' },
    { author: 2, content: 'Or just practice the transitions as part of rehearsal. Like actually rehearse the set ORDER not just individual songs.' },
    { author: 3, content: 'Good idea. Let\'s run the full set start to finish at next rehearsal.' },
    { author: 0, content: 'Added to the rehearsal plan. Full set run-through.' },
    { author: 0, content: 'New Year\'s Eve show confirmed at The Echo Room! They\'re doing a two-band bill and we\'re headlining.' },
    { author: 1, content: 'HEADLINING! Look at us growing up 🥹' },
    { author: 2, content: 'What time do we go on?' },
    { author: 0, content: '11pm. The idea is we play through midnight. They want us to do something special for the countdown.' },
    { author: 3, content: 'What if we build into Vanishing Point right at midnight? That crescendo outro would be EPIC as the clock strikes 12' },
    { author: 0, content: 'That\'s brilliant. Let\'s plan the set around that.' },
    { author: 1, content: 'I love this band so much' },
  ],
  rehearsals: [
    { author: 0, content: 'Thursday rehearsal plan:\n1. Warm up with Glass Horizon\n2. Work on the Soft Collision arrangement\n3. Run the festival set front to back\n4. If time: jam on new ideas' },
    { author: 2, content: 'Can we add 15 min to work on the Phantom Limb ending? I want to try a different fill' },
    { author: 0, content: 'Done. Adjusted the plan.' },
    { author: 3, content: 'I\'ll be 10 min late — traffic from work. Start without me?' },
    { author: 0, content: 'No worries, we\'ll warm up without you' },
    { author: 1, content: 'Post-rehearsal thoughts: Soft Collision sounded INCREDIBLE. The bridge is going to destroy people live.' },
    { author: 0, content: 'Agreed. Taylor\'s keys in the bridge gave me chills.' },
    { author: 3, content: '☺️ that cathedral reverb was the move' },
    { author: 2, content: 'My one note: I think we need to bring the energy down more before the last chorus of Weight of Light. Make the contrast bigger.' },
    { author: 0, content: 'Good catch. What if just bass and vocals for 4 bars before everyone comes back in?' },
    { author: 1, content: 'I\'m into it. The silence will make the explosion hit harder.' },
    { author: 2, content: 'Exactly what I was thinking' },
    { author: 0, content: 'Saturday full-day session. 10am to 6pm at Jam Space. Agenda:' },
    { author: 0, content: '10-11: Warm up + run easy songs\n11-1: Deep work on new material\n1-2: Lunch break\n2-4: Full set rehearsal x2\n4-5: Fix problem spots\n5-6: Free jam / new ideas' },
    { author: 1, content: 'This is intense. I love it.' },
    { author: 2, content: 'Bringing snacks this time. Learned my lesson.' },
    { author: 3, content: 'Coffee and bagels crew reporting for duty 🫡' },
    { author: 0, content: 'That rehearsal was PRODUCTIVE. I think we nailed the set.' },
    { author: 1, content: 'Honestly the best we\'ve ever sounded. The transitions were seamless.' },
    { author: 2, content: 'Running the set twice back to back really helped. By the second time it was muscle memory.' },
    { author: 3, content: 'The new arrangement of Flicker is SO much better with the stripped verse. Night and day difference.' },
    { author: 0, content: 'Agreed. Let\'s keep this momentum going. Rehearsal again Tuesday?' },
    { author: 1, content: '👍' },
    { author: 2, content: '👍' },
    { author: 3, content: '👍' },
    { author: 0, content: 'Quick rehearsal notes from last night:\n- Neon Prayers is now consistently tight ✅\n- Tidal needs more dynamic range — we\'re all playing too loud in the verse\n- The new song (working title "Radio Silence") is taking shape\n- Jordan\'s new drum fill in Undertow is 🔥' },
    { author: 2, content: 'Thanks! I\'ve been practicing that fill for like two weeks' },
    { author: 1, content: 'On the Tidal dynamics thing — I\'ll pull back my volume in the verse. Maybe use fingers instead of a pick.' },
    { author: 0, content: 'That would be perfect. Fingers for verse, pick for chorus.' },
    { author: 3, content: 'I\'ll drop out of the first verse entirely and come in on verse 2. Build it up gradually.' },
    { author: 0, content: 'Love it. These are the details that separate good bands from great bands.' },
    { author: 2, content: 'Next rehearsal: can we work on our stage presence too? I watched the video from The Depot and we barely move' },
    { author: 0, content: 'Ouch but fair. We should practice like we\'re performing, not just playing.' },
    { author: 1, content: 'Hard to move with a bass but I\'ll try 😅' },
    { author: 3, content: 'I\'m literally behind a keyboard stand. My options are limited 😂' },
    { author: 0, content: 'Even just facial expressions and energy. We don\'t need to be doing backflips, just... present.' },
    { author: 2, content: 'Fair point. I\'ll try to look up from the drums more' },
  ],
  gear: [
    { author: 0, content: 'Pedalboard update: added the Strymon BlueSky reverb. This thing is MAGICAL for the ambient parts.' },
    { author: 3, content: 'Strymon makes the best reverbs. I have their BigSky on the Nord and it\'s incredible.' },
    { author: 1, content: 'How\'s the signal chain now Alex?' },
    { author: 0, content: 'Tuner → Compressor → Tubescreamer → BlueSky → DD-500 delay → amp. Clean and simple.' },
    { author: 2, content: 'I just got new cymbal felts. The old ones were completely destroyed. Also picked up a 20" K Custom Dark ride.' },
    { author: 1, content: 'K Custom Dark? Fancy! Those are pricey but they sound amazing' },
    { author: 2, content: 'Tax refund money well spent 😄' },
    { author: 3, content: 'PSA: Sweetwater has 15% off all Moog stuff this week. I may have ordered a SubPhatty...' },
    { author: 0, content: 'Taylor!!! We said no more synths until we record the album!' },
    { author: 3, content: 'In my defense... it was 15% off 🥺' },
    { author: 1, content: 'I don\'t blame you. Moogs are irresistible.' },
    { author: 2, content: 'GAS is a serious condition. Gear Acquisition Syndrome.' },
    { author: 0, content: 'We\'re all guilty. My pedalboard weighs more than my guitar at this point.' },
    { author: 1, content: 'String question: does anyone else break strings constantly? I\'m going through a set every 2 weeks.' },
    { author: 0, content: 'Check your bridge saddles. If they have burrs they\'ll eat through strings.' },
    { author: 1, content: 'Oh that\'s actually really helpful. I\'ll check tonight.' },
    { author: 2, content: 'My kick pedal is making a squeaking noise. Anyone know how to fix a DW 5000?' },
    { author: 0, content: 'WD-40 on the spring and chain. Or check if the hinge pin needs lubrication.' },
    { author: 2, content: 'Tried WD-40, it helped! Thanks 🙏' },
    { author: 3, content: 'I need recommendations for a good sustain pedal for the Nord. The stock one feels cheap.' },
    { author: 0, content: 'Roland DP-10. Half-pedaling support and feels like a real piano.' },
    { author: 3, content: 'Ordered. You\'re full of good advice today Alex.' },
    { author: 0, content: 'I spend too much time on gear forums 😂' },
    { author: 1, content: 'My amp is making a weird humming noise. Could be a tube going bad?' },
    { author: 0, content: 'Probably. How old are the tubes?' },
    { author: 1, content: 'No idea honestly. Bought the amp used.' },
    { author: 0, content: 'Get a matched set of JJ EL34s. Should be about $40 and it\'ll sound like a new amp.' },
    { author: 2, content: 'In-ear monitor question: are the Shure SE215s worth it or should I save up for the SE535s?' },
    { author: 3, content: 'SE215s are great for the price. I\'d start there.' },
    { author: 0, content: 'Agree. The 535s are amazing but 3x the price. 215s will serve you well.' },
    { author: 2, content: 'SE215s it is. Thanks team.' },
    { author: 1, content: 'Just FYI my bass rig for the festival will be: Fender P-Bass → SansAmp → DI. Keeping it simple.' },
    { author: 0, content: 'P-Bass through a SansAmp is the greatest bass tone of all time. Don\'t let anyone tell you otherwise.' },
    { author: 2, content: 'Fact' },
  ],
  setlists: [
    { author: 0, content: 'For the Slow Dive support slot — 30 minutes means about 6-7 songs. What do we lead with?' },
    { author: 1, content: 'Glass Horizon. Big energy, grabs attention immediately.' },
    { author: 3, content: 'Agree. Then maybe Neon Prayers to keep the energy up?' },
    { author: 2, content: 'What about slower stuff? Do we go all high-energy for a support set?' },
    { author: 0, content: 'I think mostly high-energy but with one quiet moment. Show our range.' },
    { author: 1, content: 'Tidal in the middle? Then build back up to close with Lucid?' },
    { author: 0, content: 'Love it. Here\'s my proposal:\n1. Glass Horizon\n2. Neon Prayers\n3. Corridor\n4. Tidal\n5. Undertow\n6. Lucid' },
    { author: 3, content: 'That flow is perfect. The Tidal → Undertow → Lucid arc at the end is 🤌' },
    { author: 2, content: 'Approved. Let\'s drill this set until it\'s flawless.' },
    { author: 0, content: 'Creating the setlist now. "Festival Short Set"' },
    { author: 0, content: 'For the Echo Room shows, I\'m thinking a longer set. 10-12 songs with a set break.' },
    { author: 1, content: 'Makes sense for a headlining set. Two sets of 5-6?' },
    { author: 0, content: 'Exactly. First set: the hitters. Break. Second set: deeper cuts and the big emotional finish.' },
    { author: 3, content: 'Set 2 should end with Weight of Light → Vanishing Point. The one-two punch.' },
    { author: 2, content: 'Vanishing Point as the closer... that crescendo would be insane in that room' },
    { author: 0, content: 'Settled. I\'ll build it out as "Friday Night Set"' },
    { author: 1, content: 'We should also have an acoustic set ready. Some of these coffee shop gigs only want acoustic.' },
    { author: 0, content: 'Good call. The Cartographer, Afterglow, Weight of Light, Tidal, and The Long Way Home all work acoustic.' },
    { author: 3, content: 'I can bring a melodica for the acoustic set for extra flavor' },
    { author: 2, content: 'Cajon for me. Keeps it intimate.' },
    { author: 0, content: 'Creating "Acoustic Session" setlist now' },
    { author: 1, content: 'For the New Year\'s show — should we debut any of the unreleased stuff?' },
    { author: 0, content: 'I think Soft Collision is ready. Maybe Radio Silence too if we nail it in rehearsal.' },
    { author: 3, content: 'Soft Collision is definitely ready. Radio Silence needs another week I think.' },
    { author: 2, content: 'Let\'s put both in the "New Material Showcase" setlist and see how they feel' },
    { author: 0, content: 'On it.' },
  ],
  random: [
    { author: 2, content: 'Just saw a luna moth in my backyard. I feel like this is a sign. 🦋' },
    { author: 0, content: 'Quick, catch it and make it our mascot' },
    { author: 1, content: 'Pretty sure they\'re protected lol' },
    { author: 3, content: 'Fun fact: luna moths don\'t have mouths. They only live about a week as adults. Their entire purpose is to find a mate and reproduce.' },
    { author: 2, content: 'That\'s simultaneously beautiful and depressing' },
    { author: 0, content: 'Kind of poetic for a band name though. Live fast, be beautiful, make something that outlasts you.' },
    { author: 1, content: 'Deep thoughts with Alex Rivera 📚' },
    { author: 0, content: 'OK who put my guitar pick in the freezer 🧊' },
    { author: 2, content: '...it might have been me. I was experimenting with frozen picks for a different attack sound.' },
    { author: 0, content: 'Did it work?' },
    { author: 2, content: 'No. It was just cold and wet.' },
    { author: 3, content: '😂😂😂' },
    { author: 1, content: 'Jordan literally said "experimenting with frozen picks" with a straight face' },
    { author: 0, content: 'This is why we love you Jordan' },
    { author: 3, content: 'Just listened to the new Japanese Breakfast album. If you haven\'t heard it, stop what you\'re doing and listen now.' },
    { author: 0, content: 'Michelle Zauner is a genius. Her book was incredible too.' },
    { author: 1, content: 'Crying in H Mart made me cry. At H Mart.' },
    { author: 2, content: 'Music recs thread? Here\'s mine: Alvvays - "Blue Rev". Perfect dream pop.' },
    { author: 0, content: 'Godspeed You! Black Emperor - "G_d\'s Pee AT STATE\'S END!" for when you want to feel something cosmic' },
    { author: 3, content: 'Bjork - "Fossora" for the weirdos among us (it\'s me, I\'m the weirdo)' },
    { author: 1, content: 'Khruangbin - "A La Sala". The groove on that album...' },
    { author: 2, content: 'All excellent choices. This is why our band sounds the way it does — we all listen to such different stuff' },
    { author: 0, content: 'Hot take: pineapple on pizza is acceptable' },
    { author: 1, content: 'I\'m going to pretend I didn\'t see this' },
    { author: 2, content: 'BLOCKED' },
    { author: 3, content: 'Hawaiian pizza is delicious and I will die on this hill alongside Alex' },
    { author: 0, content: 'Taylor I always knew you had taste' },
    { author: 1, content: 'This band is now split 50/50 on the most important issue of our generation' },
    { author: 2, content: 'Sam and I are forming a new band. Anti-Pineapple.' },
    { author: 0, content: '😂 our first creative difference' },
    { author: 3, content: 'Band meeting! Important question: what should our merch tagline be?' },
    { author: 0, content: '"Drawn to the light"? Plays on the moth thing.' },
    { author: 1, content: '"Brief and beautiful" — like the luna moth\'s lifespan' },
    { author: 2, content: '"This too shall flutter"' },
    { author: 3, content: 'OK "brief and beautiful" is actually perfect' },
    { author: 0, content: 'Sam wins this round 🏆' },
    { author: 2, content: 'I saw someone wearing our shirt at the grocery store yesterday. Random stranger.' },
    { author: 0, content: 'WHAT! Did you say anything?' },
    { author: 2, content: 'I panicked and hid behind the cereal aisle' },
    { author: 1, content: 'Classic Jordan' },
    { author: 3, content: 'We\'re famous! Kind of! In the cereal aisle!' },
    { author: 0, content: 'This is peak indie fame right here' },
  ],
};

const DM_MESSAGES = [
  { author: 0, content: 'Hey Sam, wanted to chat privately about something' },
  { author: 1, content: 'What\'s up?' },
  { author: 0, content: 'I\'ve been thinking about bringing someone else in. Maybe a second guitarist or a violinist.' },
  { author: 1, content: 'Interesting. What made you think about that?' },
  { author: 0, content: 'The layering on our recordings is getting complex. Hard to replicate live with just 4 of us.' },
  { author: 1, content: 'I get that. Vanishing Point especially — there are like 6 guitar tracks on the recording' },
  { author: 0, content: 'Exactly. A second guitarist could cover those parts live.' },
  { author: 1, content: 'What about just using backing tracks? Lots of bands do that.' },
  { author: 0, content: 'I thought about it but it feels... not us? We\'re about the live energy.' },
  { author: 1, content: 'Fair point. Who did you have in mind?' },
  { author: 0, content: 'Nobody specific yet. Just wanted to float the idea with you first since you\'ve been here from day one.' },
  { author: 1, content: 'I appreciate that. I think it\'s worth discussing with everyone, but let\'s feel it out slowly. No rush.' },
  { author: 0, content: 'Agreed. Maybe we invite someone to sit in on a rehearsal first and see how the chemistry is.' },
  { author: 1, content: 'Smart. Low pressure. If it clicks, great. If not, no awkwardness.' },
  { author: 0, content: 'Cool. I\'ll bring it up at practice next week.' },
  { author: 1, content: 'Sounds good. Also — unrelated — I think Taylor is really gelling with the band. Great call bringing them in.' },
  { author: 0, content: 'Right? The synth stuff has elevated everything. I can\'t imagine our sound without it now.' },
  { author: 1, content: 'Same. OK see you Thursday 👋' },
  { author: 0, content: '👋 thanks for always being real with me Sam' },
  { author: 1, content: 'That\'s what bandmates are for 🤘' },
];

const REACTIONS = ['🔥', '🎸', '👍', '❤️', '😂', '🎵', '💯', '🤘', '👏', '✨'];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/** Random date within last N days */
function randomPastDate(daysBack, startDaysBack = 0) {
  const now = Date.now();
  const start = now - daysBack * 86400000;
  const end = now - startDaysBack * 86400000;
  return new Date(start + Math.random() * (end - start));
}

/** Random future date within next N days */
function randomFutureDate(daysAhead, startDays = 7) {
  const now = Date.now();
  const start = now + startDays * 86400000;
  const end = now + daysAhead * 86400000;
  return new Date(start + Math.random() * (end - start));
}

/** Pick random item from array */
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ============================================================
// MAIN
// ============================================================

async function main() {
  const clean = process.argv.includes('--clean');

  // Check if workspace exists
  const existing = await prisma.workspace.findFirst({
    where: { name: WORKSPACE_NAME, deletedAt: null }
  });

  if (existing && !clean) {
    console.log(`Workspace "${WORKSPACE_NAME}" already exists (ID: ${existing.id}).`);
    console.log('Run with --clean to delete and re-create.');
    process.exit(0);
  }

  if (existing && clean) {
    console.log(`Deleting existing workspace "${WORKSPACE_NAME}"...`);
    await prisma.workspace.delete({ where: { id: existing.id } });
    // Delete demo users
    for (const m of MEMBERS) {
      await prisma.user.deleteMany({ where: { email: m.email } });
    }
    console.log('Cleaned up.');
  }

  console.log(`\nSeeding "${WORKSPACE_NAME}" demo workspace...\n`);
  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ---- USERS ----
  const users = [];
  for (const m of MEMBERS) {
    const user = await prisma.user.upsert({
      where: { email: m.email },
      create: {
        email: m.email,
        displayName: m.displayName,
        password: hashedPassword,
        authProvider: 'local',
        emailVerified: true,
        avatarUrl: m.avatarUrl,
      },
      update: { password: hashedPassword, avatarUrl: m.avatarUrl },
    });
    users.push(user);
  }
  console.log(`Created ${users.length} users (login: any email / ${DEMO_PASSWORD})`);

  // ---- WORKSPACE ----
  const workspace = await prisma.workspace.create({
    data: {
      name: WORKSPACE_NAME,
      inviteCode: randomUUID().slice(0, 10).toUpperCase(),
      currency: 'USD',
      plan: 'PRO',
      planSource: 'MANUAL',
      members: {
        create: users.map((u, i) => ({
          userId: u.id,
          role: MEMBERS[i].role,
        })),
      },
    },
  });
  console.log(`Created workspace: ${workspace.name} (${workspace.id})`);

  const allUserIds = users.map(u => u.id);

  // ---- CHANNEL GROUPS ----
  const bandBizGroup = await prisma.channelGroup.create({
    data: { name: 'Band Business', workspaceId: workspace.id, position: 0 },
  });
  const creativeGroup = await prisma.channelGroup.create({
    data: { name: 'Creative', workspaceId: workspace.id, position: 1 },
  });
  console.log('Created 2 channel groups');

  // ---- CHANNELS + MESSAGES ----
  const channelGroupMap = {
    'gig-planning': bandBizGroup.id,
    'setlists': bandBizGroup.id,
    'rehearsals': bandBizGroup.id,
    'songwriting': creativeGroup.id,
    'gear': creativeGroup.id,
  };

  const channelMap = {}; // name → channel
  const allMessages = []; // track all created messages for reactions/threads/pins

  for (const [channelName, msgTemplates] of Object.entries(CHANNEL_MESSAGES)) {
    const channel = await prisma.channel.create({
      data: {
        name: channelName,
        workspaceId: workspace.id,
        description: `${channelName.replace(/-/g, ' ')} discussion`,
        groupId: channelGroupMap[channelName] || null,
        members: {
          create: allUserIds.map(uid => ({ userId: uid })),
        },
      },
    });
    channelMap[channelName] = channel;

    // Create messages with spread-out timestamps
    const messages = [];
    for (let i = 0; i < msgTemplates.length; i++) {
      const tmpl = msgTemplates[i];
      const date = randomPastDate(180, Math.floor((180 * (msgTemplates.length - i)) / msgTemplates.length));
      messages.push({
        content: tmpl.content,
        channelId: channel.id,
        authorId: allUserIds[tmpl.author],
        createdAt: date,
        updatedAt: date,
      });
    }

    const created = await prisma.message.createManyAndReturn({
      data: messages,
    });
    allMessages.push(...created.map((m, i) => ({ ...m, channelName, authorIdx: msgTemplates[i].author })));
    console.log(`  #${channelName}: ${created.length} messages`);
  }

  // ---- DM CHANNEL ----
  const dmChannel = await prisma.channel.create({
    data: {
      name: `${users[0].id}-${users[1].id}`,
      workspaceId: workspace.id,
      isDirect: true,
      isPrivate: true,
      members: {
        create: [{ userId: users[0].id }, { userId: users[1].id }],
      },
    },
  });

  const dmMsgs = DM_MESSAGES.map((m, i) => ({
    content: m.content,
    channelId: dmChannel.id,
    authorId: allUserIds[m.author],
    createdAt: randomPastDate(60, Math.floor((60 * (DM_MESSAGES.length - i)) / DM_MESSAGES.length)),
    updatedAt: new Date(),
  }));
  await prisma.message.createMany({ data: dmMsgs });
  console.log(`  DM (Alex ↔ Sam): ${dmMsgs.length} messages`);

  // ---- THREADED REPLIES (15% of messages) ----
  const threadCandidates = allMessages.filter((_, i) => i % 7 === 0).slice(0, 40);
  let threadCount = 0;
  for (const parent of threadCandidates) {
    const replyCount = 1 + Math.floor(Math.random() * 3);
    for (let r = 0; r < replyCount; r++) {
      const replyAuthor = allUserIds[(parent.authorIdx + r + 1) % 4];
      await prisma.message.create({
        data: {
          content: pick([
            'Totally agree!', 'Good point 👍', 'Let\'s discuss at rehearsal',
            'I was thinking the same thing', 'Nice!', '+1', 'This ^^',
            'Love this idea', 'On it!', 'Great call', 'Makes sense to me',
            'Let\'s try it!', '🔥', 'YES', 'Hmm interesting thought',
          ]),
          channelId: parent.channelId,
          authorId: replyAuthor,
          parentId: parent.id,
          createdAt: new Date(new Date(parent.createdAt).getTime() + (r + 1) * 300000),
          updatedAt: new Date(),
        },
      });
      threadCount++;
    }
  }
  console.log(`Created ${threadCount} threaded replies`);

  // ---- REACTIONS (20% of messages) ----
  const reactionCandidates = allMessages.filter((_, i) => i % 5 === 0);
  let reactionCount = 0;
  for (const msg of reactionCandidates) {
    const numReactions = 1 + Math.floor(Math.random() * 3);
    const usedEmoji = new Set();
    const usedUserEmoji = new Set();
    for (let r = 0; r < numReactions; r++) {
      const emoji = pick(REACTIONS);
      const reactorId = allUserIds[Math.floor(Math.random() * 4)];
      const key = `${reactorId}-${msg.id}-${emoji}`;
      if (usedUserEmoji.has(key)) continue;
      usedUserEmoji.add(key);
      try {
        await prisma.reaction.create({
          data: { emoji, userId: reactorId, messageId: msg.id },
        });
        reactionCount++;
      } catch { /* unique constraint — skip */ }
    }
  }
  console.log(`Created ${reactionCount} reactions`);

  // ---- PINNED MESSAGES ----
  const generalMsgs = allMessages.filter(m => m.channelName === 'general');
  const gigMsgs = allMessages.filter(m => m.channelName === 'gig-planning');
  if (generalMsgs.length > 5) {
    await prisma.pinnedMessage.create({
      data: { messageId: generalMsgs[5].id, channelId: channelMap.general.id, pinnedById: users[0].id },
    });
  }
  if (gigMsgs.length > 3) {
    await prisma.pinnedMessage.create({
      data: { messageId: gigMsgs[3].id, channelId: channelMap['gig-planning'].id, pinnedById: users[0].id },
    });
  }
  console.log('Created 2 pinned messages');

  // ---- SAVED MESSAGES ----
  const saveCandidates = allMessages.filter(m => m.channelName === 'songwriting').slice(0, 3);
  for (const msg of saveCandidates) {
    await prisma.savedMessage.create({
      data: { userId: users[0].id, messageId: msg.id },
    });
  }
  console.log('Created 3 saved messages');

  // ---- BAND MEMBERS ----
  const bandMembers = [];
  for (let i = 0; i < users.length; i++) {
    const bm = await prisma.bandMember.create({
      data: {
        name: MEMBERS[i].displayName,
        workspaceId: workspace.id,
        linkedUserId: users[i].id,
        stints: {
          create: {
            instruments: MEMBERS[i].instruments,
            startDate: i === 3 ? new Date('2024-11-01') : new Date('2024-06-15'),
          },
        },
      },
    });
    bandMembers.push(bm);
  }

  // Chris Nakamura — original member, left Oct 2024, rejoined Jan 2026 as touring member
  const chrisMember = await prisma.bandMember.create({
    data: {
      name: 'Chris Nakamura',
      workspaceId: workspace.id,
      notes: 'Original rhythm guitarist. Left in Oct 2024 over creative differences. Came back Jan 2026 as a part-time touring member for bigger shows.',
      imageUrl: 'https://api.dicebear.com/9.x/adventurer/svg?seed=Chris&backgroundColor=ffdfba',
      stints: {
        create: [
          { instruments: ['Rhythm Guitar'], startDate: new Date('2024-06-15'), endDate: new Date('2024-10-15') },
          { instruments: ['Rhythm Guitar', 'Backing Vocals'], startDate: new Date('2026-01-15') },
        ],
      },
    },
  });

  // Morgan Ellis — guest musician, filled in for 2 gigs in March 2025
  const morganMember = await prisma.bandMember.create({
    data: {
      name: 'Morgan Ellis',
      workspaceId: workspace.id,
      isGuest: true,
      notes: 'Friend of Sam. Filled in on rhythm guitar for two shows in March 2025 while Alex had a hand injury. Great player — open to guesting again.',
      imageUrl: 'https://api.dicebear.com/9.x/adventurer/svg?seed=Morgan&backgroundColor=c3fae8',
      stints: {
        create: {
          instruments: ['Guitar'],
          startDate: new Date('2025-03-01'),
          endDate: new Date('2025-03-20'),
        },
      },
    },
  });

  console.log(`Created ${bandMembers.length + 2} band members (incl. 1 former/returned, 1 guest)`);

  // ---- SONGS ----
  const songs = [];
  for (const s of SONGS) {
    const song = await prisma.song.create({
      data: {
        title: s.title,
        artist: WORKSPACE_NAME,
        workspaceId: workspace.id,
        key: s.key,
        bpm: s.bpm,
        duration: s.duration,
        notes: s.notes || null,
        lyrics: s.lyrics || null,
        arrangement: s.arrangement || null,
        createdById: users[0].id,
      },
    });
    songs.push(song);
  }
  console.log(`Created ${songs.length} songs`);

  // ---- SETLISTS ----
  const setlistDefs = [
    {
      name: 'Friday Night Set', description: 'Full headlining set with set break',
      items: [
        { songIdx: 0, type: 'SONG' }, { songIdx: 4, type: 'SONG' }, { songIdx: 9, type: 'SONG' },
        { songIdx: 5, type: 'SONG' }, { songIdx: 11, type: 'SONG' },
        { type: 'MC', label: 'Introduce the band', duration: 60 },
        { type: 'SET_BREAK', label: 'Set Break', duration: 600 },
        { songIdx: 3, type: 'SONG' }, { songIdx: 10, type: 'SONG' },
        { songIdx: 8, type: 'SONG' }, { songIdx: 14, type: 'SONG' }, { songIdx: 19, type: 'SONG' },
      ]
    },
    {
      name: 'Festival Short Set', description: '30-minute high-energy festival set',
      items: [
        { songIdx: 2, type: 'SONG' }, { songIdx: 4, type: 'SONG' }, { songIdx: 9, type: 'SONG' },
        { songIdx: 3, type: 'SONG' }, { songIdx: 11, type: 'SONG' }, { songIdx: 19, type: 'SONG' },
      ]
    },
    {
      name: 'Acoustic Session', description: 'Stripped-back acoustic set',
      items: [
        { songIdx: 5, type: 'SONG' }, { songIdx: 17, type: 'SONG' }, { songIdx: 8, type: 'SONG' },
        { songIdx: 3, type: 'SONG' }, { songIdx: 18, type: 'SONG' },
      ]
    },
    {
      name: 'New Material Showcase', description: 'Showcasing newest songs',
      items: [
        { songIdx: 15, type: 'SONG' }, { songIdx: 16, type: 'SONG' }, { songIdx: 12, type: 'SONG' },
        { songIdx: 13, type: 'SONG' }, { songIdx: 7, type: 'SONG' }, { songIdx: 6, type: 'SONG' },
        { songIdx: 10, type: 'SONG' },
      ]
    },
  ];

  const setlists = [];
  for (const def of setlistDefs) {
    const setlist = await prisma.setlist.create({
      data: {
        name: def.name,
        description: def.description,
        workspaceId: workspace.id,
        createdById: users[0].id,
        songs: {
          create: def.items.map((item, idx) => ({
            position: idx,
            type: item.type,
            songId: item.songIdx !== undefined ? songs[item.songIdx].id : null,
            label: item.label || null,
            duration: item.duration || null,
          })),
        },
        performers: {
          create: bandMembers.map(bm => ({ bandMemberId: bm.id })),
        },
      },
    });
    setlists.push(setlist);
  }
  console.log(`Created ${setlists.length} setlists`);

  // ---- GIGS ----
  const gigs = [];
  const gigDefs = [
    // Past completed gigs
    { idx: 3, daysAgo: 160, status: 'COMPLETED', type: 'GIG', setlistIdx: 2 },
    { idx: 4, daysAgo: 120, status: 'COMPLETED', type: 'GIG', setlistIdx: 3 },
    { idx: 1, daysAgo: 90, status: 'COMPLETED', type: 'GIG', setlistIdx: 0 },
    { idx: 2, daysAgo: 60, status: 'COMPLETED', type: 'GIG', setlistIdx: 1 },
    { idx: 5, daysAgo: 30, status: 'COMPLETED', type: 'GIG', setlistIdx: 0 },
    { idx: 0, daysAgo: 14, status: 'COMPLETED', type: 'GIG', setlistIdx: 0 },
    // Past cancelled
    { idx: 6, daysAgo: 45, status: 'CANCELLED', type: 'GIG', setlistIdx: null },
    // Future scheduled
    { idx: 7, daysAgo: -21, status: 'SCHEDULED', type: 'GIG', setlistIdx: 1 },
    { idx: 8, daysAgo: -60, status: 'SCHEDULED', type: 'GIG', setlistIdx: null },
    // Future rehearsal
    { idx: -1, daysAgo: -5, status: 'SCHEDULED', type: 'REHEARSAL', setlistIdx: null },
  ];

  for (const gd of gigDefs) {
    const venueData = gd.idx >= 0 ? VENUES[gd.idx] : { title: 'Weekly Rehearsal', venue: 'Jam Space Studios', address: '77 Industrial Blvd, Unit 4', pay: 0 };
    const gigDate = new Date(Date.now() - gd.daysAgo * 86400000);
    gigDate.setHours(19, 0, 0, 0);
    const endDate = new Date(gigDate.getTime() + 3 * 3600000);

    const gig = await prisma.gig.create({
      data: {
        title: venueData.title,
        venue: venueData.venue,
        address: venueData.address,
        date: gigDate,
        endDate,
        type: gd.type,
        status: gd.status,
        pay: venueData.pay > 0 ? venueData.pay : null,
        notes: gd.status === 'CANCELLED' ? 'Cancelled due to venue double-booking' : `Load in at ${gd.type === 'REHEARSAL' ? '7pm' : '6pm'}. ${gd.type === 'GIG' ? 'Sound check at 7.' : ''}`,
        workspaceId: workspace.id,
        createdById: users[0].id,
        attendees: {
          create: bandMembers.map(bm => ({
            bandMemberId: bm.id,
            status: gd.status === 'CANCELLED' ? 'NOT_ATTENDING' : 'ATTENDING',
          })),
        },
      },
    });

    // Link setlist via GigSetlist if specified
    if (gd.setlistIdx !== null) {
      await prisma.gigSetlist.create({
        data: {
          gigId: gig.id,
          setlistId: setlists[gd.setlistIdx].id,
          setNumber: 1,
        },
      });
    }

    gigs.push(gig);
  }
  console.log(`Created ${gigs.length} gigs (${gigs.filter(g => g.status === 'COMPLETED').length} completed)`);

  // ---- BAND KITTY ----
  const kitty = await prisma.bandKitty.create({
    data: {
      workspaceId: workspace.id,
      startingBalance: 0,
      currency: 'USD',
      transactions: {
        create: [
          { type: 'OTHER_INCOME', amount: 200, description: 'Initial band fund contributions', date: randomPastDate(150), createdById: users[0].id },
          { type: 'GIG_PAY', amount: 150, description: 'The Basement Show pay', date: randomPastDate(140), createdById: users[0].id, gigId: gigs[0].id },
          { type: 'EXPENSE', amount: -80, description: 'Rehearsal room (4 hours)', category: 'rehearsal', date: randomPastDate(130), createdById: users[1].id },
          { type: 'GIG_PAY', amount: 200, description: 'Velvet Underground pay', date: randomPastDate(80), createdById: users[0].id, gigId: gigs[2].id },
          { type: 'EXPENSE', amount: -45, description: 'Gas money for festival', category: 'travel', date: randomPastDate(55), createdById: users[2].id },
          { type: 'GIG_PAY', amount: 500, description: 'Moonlight Festival pay', date: randomPastDate(50), createdById: users[0].id, gigId: gigs[3].id },
          { type: 'EXPENSE', amount: -120, description: 'T-shirt printing (30 shirts)', category: 'promo', date: randomPastDate(40), createdById: users[0].id },
          { type: 'EXPENSE', amount: -25, description: 'Sticker printing (200 die-cut)', category: 'promo', date: randomPastDate(35), createdById: users[3].id },
        ],
      },
    },
  });
  console.log('Created band kitty with 8 transactions');

  // ---- CONTACTS ----
  for (const c of CONTACTS) {
    await prisma.contact.create({
      data: { ...c, workspaceId: workspace.id, createdById: users[0].id },
    });
  }
  console.log(`Created ${CONTACTS.length} contacts`);

  // ---- ANNOUNCEMENTS ----
  const ann1 = await prisma.announcement.create({
    data: {
      title: 'Slow Dive Support Slot Confirmed!',
      content: 'We\'re opening for Slow Dive at The Catalyst on May 15th! 500-cap venue, 30-minute set. This is the biggest opportunity we\'ve had. Let\'s make every rehearsal count between now and then. 🦋',
      priority: 'high',
      isPinned: true,
      workspaceId: workspace.id,
      createdById: users[0].id,
      expiresAt: randomFutureDate(90),
      acknowledgments: {
        create: [
          { userId: users[1].id },
          { userId: users[2].id },
        ],
      },
    },
  });

  await prisma.announcement.create({
    data: {
      title: 'EP Release Party Details',
      content: 'The "Pale Satellite" EP release party is confirmed for Oct 1 at The Glass House. Free entry, all ages. Invite everyone you know!',
      priority: 'normal',
      isPinned: false,
      workspaceId: workspace.id,
      createdById: users[0].id,
      expiresAt: randomPastDate(30),
    },
  });
  console.log('Created 2 announcements');

  // ---- POLLS ----
  const poll1 = await prisma.poll.create({
    data: {
      question: 'What should we title the next EP?',
      description: 'We need to decide before the recording sessions start.',
      workspaceId: workspace.id,
      createdById: users[0].id,
      isAnonymous: false,
      options: {
        create: [
          { text: 'Glass Horizon', position: 0 },
          { text: 'Soft Collisions', position: 1 },
          { text: 'Brief & Beautiful', position: 2 },
          { text: 'Midnight Architecture', position: 3 },
        ],
      },
    },
    include: { options: true },
  });
  await prisma.pollVote.createMany({
    data: [
      { optionId: poll1.options[2].id, userId: users[0].id },
      { optionId: poll1.options[2].id, userId: users[1].id },
      { optionId: poll1.options[1].id, userId: users[2].id },
    ],
  });

  const poll2 = await prisma.poll.create({
    data: {
      question: 'Which cover should we add to our set?',
      workspaceId: workspace.id,
      createdById: users[2].id,
      isAnonymous: false,
      isClosed: true,
      options: {
        create: [
          { text: 'Just Like Heaven - The Cure', position: 0 },
          { text: 'Bizarre Love Triangle - New Order', position: 1 },
          { text: 'Maps - Yeah Yeah Yeahs', position: 2 },
        ],
      },
    },
    include: { options: true },
  });
  await prisma.pollVote.createMany({
    data: [
      { optionId: poll2.options[1].id, userId: users[0].id },
      { optionId: poll2.options[1].id, userId: users[1].id },
      { optionId: poll2.options[0].id, userId: users[2].id },
      { optionId: poll2.options[1].id, userId: users[3].id },
    ],
  });
  console.log('Created 2 polls with votes');

  // ---- TIMELINE EVENTS ----
  for (const te of TIMELINE_EVENTS) {
    await prisma.timelineEvent.create({
      data: {
        ...te,
        workspaceId: workspace.id,
        createdById: users[0].id,
      },
    });
  }
  console.log(`Created ${TIMELINE_EVENTS.length} timeline events`);

  // ---- PRACTICE SESSIONS ----
  const practiceSessions = [];
  for (let i = 0; i < 12; i++) {
    practiceSessions.push({
      songId: songs[Math.floor(Math.random() * songs.length)].id,
      userId: allUserIds[i % 4],
      workspaceId: workspace.id,
      duration: 15 + Math.floor(Math.random() * 60),
      notes: pick(['Worked on the bridge', 'Full run-through', 'Tricky rhythm section', 'Getting better!', 'Nailed the solo', null]),
      practicedAt: randomPastDate(14),
    });
  }
  await prisma.practiceSession.createMany({ data: practiceSessions });
  console.log(`Created ${practiceSessions.length} practice sessions`);

  // ---- AVAILABILITY ----
  const availData = [];
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    date.setHours(0, 0, 0, 0);
    // Each member marks some days
    if (dayOffset % 2 === 0) {
      for (const uid of allUserIds) {
        availData.push({
          userId: uid,
          workspaceId: workspace.id,
          date,
          status: pick(['AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'MAYBE', 'UNAVAILABLE']),
        });
      }
    }
  }
  // Dedupe by userId+workspaceId+date
  const seen = new Set();
  const uniqueAvail = availData.filter(a => {
    const key = `${a.userId}-${a.date.toISOString().split('T')[0]}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  await prisma.memberAvailability.createMany({ data: uniqueAvail });
  console.log(`Created ${uniqueAvail.length} availability records`);

  // ---- SUMMARY ----
  const totalMessages = Object.values(CHANNEL_MESSAGES).reduce((s, m) => s + m.length, 0) + DM_MESSAGES.length + threadCount;
  console.log('\n========================================');
  console.log(`  "${WORKSPACE_NAME}" Demo Workspace Ready!`);
  console.log('========================================');
  console.log(`  Users:           ${users.length}`);
  console.log(`  Channels:        ${Object.keys(CHANNEL_MESSAGES).length + 1} (+ 1 DM)`);
  console.log(`  Messages:        ~${totalMessages} (incl. threads)`);
  console.log(`  Reactions:       ${reactionCount}`);
  console.log(`  Songs:           ${songs.length}`);
  console.log(`  Setlists:        ${setlists.length}`);
  console.log(`  Gigs:            ${gigs.length}`);
  console.log(`  Band Members:    ${bandMembers.length + 2} (incl. 1 former/returned, 1 guest)`);
  console.log(`  Contacts:        ${CONTACTS.length}`);
  console.log(`  Polls:           2`);
  console.log(`  Announcements:   2`);
  console.log(`  Timeline Events: ${TIMELINE_EVENTS.length}`);
  console.log(`  Practice Logs:   ${practiceSessions.length}`);
  console.log(`  Availability:    ${uniqueAvail.length}`);
  console.log('');
  console.log(`  Login: alex@demo.bandchat.app / ${DEMO_PASSWORD}`);
  console.log(`         (or any member email with same password)`);
  console.log('========================================\n');
}

main()
  .catch(err => { console.error('Seed failed:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
