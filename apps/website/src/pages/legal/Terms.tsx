import { Component, For } from 'solid-js'
import { linkifyEmails } from '../../utils/utils'

const terms = [
  {
    title: 'Introduction',
    content:
      'By engaging in the utilization of this service, you implicitly acknowledge and concur to the subsequent terms outlined herein:',
  },
  {
    title: 'Terms of Agreement',
    content:
      'Upon accessing the digital website located at gmod-integration.com, you are consenting to be bound by these terms of service, inclusive of all pertinent laws and regulations, and affirm that you are liable for compliance with any germane local laws. Should you not find agreement with any of these terms, you are consequently disallowed from utilizing or accessing our service.',
  },
  {
    title: 'User Responsibilities and Liability Limitations',
    content:
      'We expressly disclaim any responsibility for any damages, whether direct, indirect, incidental, special or consequential, that may befall you or your server(s) in connection with your use of our service. You bear sole responsibility for any losses and damages resulting from your use of our service.',
  },
  {
    title: 'Service Provision and Termination',
    content:
      'We reserve the unassailable right to refuse or discontinue service to any individual or entity for any reason or no reason at all, at any point in time, including for violations of these Terms of Service or other policies that we deem, in our sole discretion, to be in violation of the spirit of our service.',
  },
  {
    title: 'Payment Processing and Refunds',
    content:
      'We do not process payments ourselves. We use Discord and GmodStore for payment processing. As such, we redirect you to their respective refund policies for any inquiries regarding refunds or cancellations.',
  },
  {
    title: 'Governing Legislation',
    content:
      'These terms and conditions are constructed, interpreted, and enforced in accordance with the laws of the French Republic and you irrevocably submit to the exclusive jurisdiction of the courts in that State or location for any disputes or claims arising out of or relating to these Terms and Conditions.',
  },
  {
    title: 'Affiliation and Endorsement',
    content:
      'We are not affiliated with or endorsed by any game, company, or entity mentioned on our website. All product names, logos, and brands are property of their respective owners. All company, product, and service names used in this website are for identification purposes only.',
  },
  {
    title: 'General Data Protection Regulation (GDPR) Compliance',
    content:
      "Our service is in full compliance with the European Union's General Data Protection Regulation (GDPR). You have the right to request access to, rectification, or deletion of your personal data at any time by contacting us at contact@gmod-integration.com.",
  },
  {
    title: 'Modifications to the Terms of Service',
    content:
      'We retain the right to make modifications to these Terms of Service at our sole discretion and at any time. To ensure informed consent, we encourage users to revisit this page regularly for updates on our terms and conditions. You acknowledge and agree that it is your responsibility to review these Terms of Service periodically to become aware of any modifications, and your continued use of our service constitutes your acceptance of these modifications.',
  },
]

const Terms: Component = () => {
  return (
    <>
      <div class="flex flex-col p-8 max-w-300 mx-auto gap-12">
        <h1 class="text-4xl font-bold my-14 text-center">Terms of Service</h1>

        <For each={terms}>
          {({ title, content }, index) => (
            <div>
              <h2 class="text-xl font-bold text-secondary mb-4">
                {index() + 1}. {title}
              </h2>
              <p class="text-base text-base-content" innerHTML={linkifyEmails(content)}></p>
            </div>
          )}
        </For>
      </div>
    </>
  )
}

export default Terms
