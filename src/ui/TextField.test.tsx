import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { TextField } from './index'

function ControlledTextField({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <TextField
      label="Guest name"
      value={value}
      onChange={(event) => {
        setValue(event.target.value)
        onChange(event.target.value)
      }}
    />
  )
}

describe('TextField', () => {
  it('exposes the label as the accessible name', () => {
    render(<TextField label="Guest name" />)
    expect(screen.getByRole('textbox', { name: 'Guest name' })).toBeInTheDocument()
  })

  it('keeps the label as the accessible name when labelHidden is set', () => {
    render(<TextField label="Guest name" labelHidden />)
    expect(screen.getByRole('textbox', { name: 'Guest name' })).toBeInTheDocument()
  })

  it('calls onChange with the typed value', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ControlledTextField onChange={onChange} />)
    const field = screen.getByRole('textbox', { name: 'Guest name' })
    await user.type(field, 'Ada')
    expect(onChange).toHaveBeenLastCalledWith('Ada')
    expect(field).toHaveValue('Ada')
  })

  it('exposes the hint as the accessible description', () => {
    render(<TextField label="Guest name" hint="As it will appear on the place card" />)
    expect(screen.getByRole('textbox', { name: 'Guest name' })).toHaveAccessibleDescription(
      'As it will appear on the place card'
    )
  })

  it('gives two instances distinct ids so each label focuses its own field', async () => {
    const user = userEvent.setup()
    render(
      <>
        <TextField label="Guest name" />
        <TextField label="Plus one" />
      </>
    )
    await user.click(screen.getByText('Guest name'))
    expect(screen.getByRole('textbox', { name: 'Guest name' })).toHaveFocus()

    await user.click(screen.getByText('Plus one'))
    expect(screen.getByRole('textbox', { name: 'Plus one' })).toHaveFocus()
  })
})
