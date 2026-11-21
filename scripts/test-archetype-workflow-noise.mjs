import assert from 'node:assert/strict';
import { detectWebsiteArchetype } from '../src/utils/codebaseAnalyzer.js';
import { extractWebsiteBlueprint } from '../src/utils/websiteWorkflowAnalyzer.js';

const brand = "Smita's Financial Consultancy Services";
const archetype = detectWebsiteArchetype(brand, 'Professional financial consultancy and investment services. The office has a meeting room and an enquiry form.');
assert.equal(archetype, 'financial');

const files = [{
  name: 'index.html',
  content: `<!doctype html><html><head><title>${brand}</title></head><body>
    <nav><a href="#settings_about_title">Settings About Product Title</a></nav>
    <section id="settings_about_title"><h2>Settings About Product Title</h2><p>Choose product title settings.</p></section>
    <section id="esd_main_msg_container_feedback_text"><h2>Esd Main Msg Container Feedback Text</h2></section>
    <form id="vendors-js-form"></form>
    <section id="consultation"><h2>Consultation Request</h2>
      <form id="consultation-request"><label for="client-name">Name</label><input id="client-name" name="clientName">
      <label for="service">Service Needed</label><input id="service" name="service"><button type="submit">Send Request</button></form>
    </section>
  </body></html>`
}];
const blueprint = extractWebsiteBlueprint(files, archetype, brand);
assert.equal(blueprint.archetype, 'financial');
assert.match(blueprint.roleSummary, /Financial Consultancy Website/);
assert(!blueprint.sections.some(section => /settings|container|feedback|esd/i.test(`${section.id} ${section.label}`)));
assert(!blueprint.forms.some(form => /vendors|settings|feedback/i.test(`${form.id} ${form.title}`)));
assert(blueprint.workflows.some(workflow => /consultation/i.test(workflow.title)));
assert(blueprint.quickActions.every(action => !/settings|product title|container|feedback/i.test(action.label)));

assert.equal(detectWebsiteArchetype('Sunrise Grand Hotel', 'Guest reservations, check-in and room bookings.'), 'hospitality');
assert.equal(detectWebsiteArchetype('Greenfield College', 'Admissions, courses and student services.'), 'academic');
assert.equal(detectWebsiteArchetype('Northstar Medical Clinic', 'Doctor appointments and prescriptions.'), 'healthcare');

console.log('PASS domain classification and workflow noise regression');
