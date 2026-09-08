import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Select } from './index'

function CourseOptions() {
  return (
    <>
      <option value="starter">Starter</option>
      <option value="main">Main</option>
      <option value="dessert">Dessert</option>
    </>
  )
}

function ControlledSelect({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = useState('starter')
  return (
    <Select
      label="Course"
      value={value}
      onChange={(event) => {
        setValue(event.target.value)
        onChange(event.target.value)
      }}
    >
      <CourseOptions />
    </Select>
  )
}

describe('Select', () => {
  it('exposes the label as the accessible name', () => {
    render(
      <Select label="Course">
        <CourseOptions />
      </Select>
    )
    expect(screen.getByRole('combobox', { name: 'Course' })).toBeInTheDocument()
  })

  it('keeps the label as the accessible name when labelHidden is set', () => {
    render(
      <Select label="Course" labelHidden>
        <CourseOptions />
      </Select>
    )
    expect(screen.getByRole('combobox', { name: 'Course' })).toBeInTheDocument()
  })

  it('exposes the hint as the accessible description', () => {
    render(
      <Select label="Course" hint="Served to the whole table">
        <CourseOptions />
      </Select>
    )
    expect(screen.getByRole('combobox', { name: 'Course' })).toHaveAccessibleDescription(
      'Served to the whole table'
    )
  })

  it('calls onChange when the value changes', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ControlledSelect onChange={onChange} />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Course' }), 'main')
    expect(onChange).toHaveBeenLastCalledWith('main')
    expect(screen.getByRole('combobox', { name: 'Course' })).toHaveValue('main')
  })

  it('gives two instances distinct ids so each label focuses its own field', async () => {
    const user = userEvent.setup()
    render(
      <>
        <Select label="Starter course">
          <CourseOptions />
        </Select>
        <Select label="Main course">
          <CourseOptions />
        </Select>
      </>
    )

    await user.click(screen.getByText('Starter course'))
    expect(screen.getByRole('combobox', { name: 'Starter course' })).toHaveFocus()

    await user.click(screen.getByText('Main course'))
    expect(screen.getByRole('combobox', { name: 'Main course' })).toHaveFocus()
  })
})
