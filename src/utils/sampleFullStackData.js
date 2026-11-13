/**
 * Ready-to-test Sample Full-Stack Files
 * Represents a real-world web application:
 * 1. Frontend: Navigation, Services, Pricing, Booking Form
 * 2. Backend: Express/Node REST API routes for services and appointments
 * 3. Database: JSON database with business hours, service details, and FAQs
 */

export const SAMPLE_FRONTEND_FILE = {
  name: 'AppNavigationAndBooking.jsx',
  type: 'frontend',
  size: '3.4 KB',
  content: `import React, { useState } from 'react';

export default function App() {
  return (
    <div className="site-wrapper">
      <header className="navbar">
        <div className="brand">Apex Digital Cloud</div>
        <nav className="nav-links">
          <a href="/services">Services</a>
          <a href="/pricing">Pricing Plans</a>
          <a href="/consultations">Book Consultation</a>
          <a href="/support">Help & FAQ</a>
        </nav>
        <button className="btn-primary">Sign In</button>
      </header>

      <section className="hero">
        <h1>Scalable AI Architecture & Cloud Engineering</h1>
        <p>We build production-ready AI agents and high-performance cloud backends.</p>
        <div className="hero-buttons">
          <a href="/pricing" className="btn-secondary">View Starter & Enterprise Plans ($49/mo - $299/mo)</a>
          <a href="/consultations" className="btn-cta">Schedule Consultation</a>
        </div>
      </section>

      <section id="consultations" className="booking-form-section">
        <h2>Schedule an Engineering Call</h2>
        <form action="/api/appointments" method="POST">
          <input name="fullName" placeholder="Your Full Name" required />
          <input name="email" type="email" placeholder="Work Email" required />
          <input name="company" placeholder="Company Name" />
          <select name="serviceInterest">
            <option value="ai-agents">AI Voice Agent Integration</option>
            <option value="cloud-arch">Cloud Architecture Audit</option>
            <option value="custom-dev">Full-Stack Web Application</option>
          </select>
          <button type="submit">Confirm Appointment</button>
        </form>
      </section>
    </div>
  );
}`
};

export const SAMPLE_BACKEND_FILE = {
  name: 'apiRoutes.js',
  type: 'backend',
  size: '2.8 KB',
  content: `const express = require('express');
const router = express.Router();

// GET /api/services - Returns list of active cloud & AI packages
router.get('/api/services', async (req, res) => {
  res.json({
    status: 'success',
    services: [
      { id: 'ai-agents', title: 'AI Voice Help Desk', fee: '$49/mo', turnaround: 'Instant' },
      { id: 'cloud-arch', title: 'Cloud Infrastructure Setup', fee: '$149/mo', turnaround: '2 business days' },
      { id: 'custom-dev', title: 'Enterprise Dedicated Engineering', fee: '$299/mo', turnaround: 'Weekly sprints' }
    ]
  });
});

// POST /api/appointments - Books a discovery consultation with engineers
router.post('/api/appointments', async (req, res) => {
  const { fullName, email, serviceInterest, appointmentDate } = req.body;
  if (!email || !fullName) {
    return res.status(400).json({ error: 'Missing required contact fields' });
  }
  // Stores booking in Firestore and returns confirmation
  const bookingId = 'BK-' + Date.now();
  res.json({
    status: 'confirmed',
    bookingId,
    message: \`Consultation confirmed for \${fullName}. Confirmation sent to \${email}.\`
  });
});

// GET /api/orders/:id - Check status of an existing deployment
router.get('/api/orders/:id', async (req, res) => {
  const { id } = req.params;
  res.json({
    orderId: id,
    status: 'Active',
    plan: 'Enterprise Voice Help Desk',
    latencyMs: 140,
    cost: '$0.00'
  });
});

// POST /api/contact - Fallback support ticket webhook
router.post('/api/contact', async (req, res) => {
  res.json({ success: true, ticketId: 'TCK-' + Date.now() });
});

module.exports = router;`
};

export const SAMPLE_DATABASE_FILE = {
  name: 'company_knowledge_db.json',
  type: 'database',
  size: '4.6 KB',
  content: JSON.stringify([
    {
      "question": "What services does Apex Digital Cloud offer?",
      "answer": "Apex Digital Cloud specializes in AI Voice Help Desk deployment, cloud infrastructure setup, and custom enterprise web applications."
    },
    {
      "question": "How much do your pricing plans cost?",
      "answer": "Our pricing plans are: Starter AI Voice Help Desk at $49/mo, Cloud Infrastructure Setup at $149/mo, and Enterprise Dedicated Engineering at $299/mo. All plans include a 30-day money-back guarantee."
    },
    {
      "question": "What are your business and support hours?",
      "answer": "Our AI voice concierge is available 24 hours a day, 7 days a week. Human engineering support operates Monday through Friday from 9:00 AM to 6:00 PM EST."
    },
    {
      "question": "How can I book an appointment or consultation?",
      "answer": "You can schedule an engineering consultation right through this voice assistant or on our website booking form. We require your full name, work email, and service interest."
    },
    {
      "question": "What is your refund policy?",
      "answer": "We offer a 100% money-back guarantee within the first 30 days of service with zero cancellation fees."
    },
    {
      "question": "Does embedding the AI voice widget cost extra?",
      "answer": "No. The AI voice widget runs via native browser Web Speech API and Firebase Cloud Firestore Spark free tier, resulting in $0 additional infrastructure cost."
    }
  ], null, 2)
};
