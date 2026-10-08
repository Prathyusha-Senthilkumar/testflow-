import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

const meta = {
  title: "Attest/Layout/AuthLayout",
  component: AuthLayout,
  parameters: { layout: "fullscreen" },
  args: { title: "Sign in to Attest", description: "Run and debug browser tests without writing Playwright code.", children: null },
} satisfies Meta<typeof AuthLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignIn: Story = {
  render: (args) => (
    <AuthLayout {...args} footer={<a className="text-brand-accent hover:underline" href="#">Forgot password?</a>}>
      <form className="space-y-4">
        <Input label="Email" type="email" placeholder="you@example.com" />
        <Input label="Password" type="password" />
        <Button className="w-full">Sign in</Button>
      </form>
    </AuthLayout>
  ),
};
export const WithError: Story = {
  render: (args) => (
    <AuthLayout {...args}>
      <form className="space-y-4">
        <Input label="Email" type="email" defaultValue="qa@example.com" />
        <Input label="Password" type="password" />
        <Alert variant="error">Invalid email or password.</Alert>
        <Button className="w-full">Sign in</Button>
      </form>
    </AuthLayout>
  ),
};
