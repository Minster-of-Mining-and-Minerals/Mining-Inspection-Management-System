import React from 'react'
import ReactSelect from 'react-select'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
  data?: {
    icon?: string
    description?: string
  }
}

interface SearchableSelectProps {
  value?: SelectOption | SelectOption[] | null
  onChange: (value: SelectOption | SelectOption[] | null) => void
  options: SelectOption[]
  isMulti?: boolean
  isSearchable?: boolean
  isClearable?: boolean
  placeholder?: string
  isDisabled?: boolean
  className?: string
  error?: boolean
  onBlur?: () => void
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  onChange,
  options,
  isMulti = false,
  isSearchable = true,
  isClearable = true,
  placeholder = 'Select an option...',
  isDisabled = false,
  className,
  error = false,
  onBlur,
}) => {
  const handleChange = (newValue: unknown) => {
    if (isMulti) {
      onChange(newValue as SelectOption[])
    } else {
      onChange(newValue as SelectOption | null)
    }
  }

  return (
    <div className={cn('w-full', className)}>
      <ReactSelect
        value={value}
        onChange={handleChange}
        options={options}
        isMulti={isMulti}
        isSearchable={isSearchable}
        isClearable={isClearable}
        placeholder={placeholder}
        className="react-select-container"
        classNamePrefix="react-select"
        noOptionsMessage={() => 'No options available'}
        loadingMessage={() => 'Loading...'}
        isDisabled={isDisabled}
        menuPlacement="auto"
        closeMenuOnSelect={!isMulti}
        blurInputOnSelect={!isMulti} // keep the list open while picking several
        menuPosition="absolute"
        onBlur={onBlur}
        styles={{
          control: (provided, state) => ({
            ...provided,
            minHeight: '36px',
            border: state.isFocused
              ? '1px solid #073A55'
              : error
                ? '1px solid #dc2626'
                : '1px solid #d1d5db',
            borderRadius: '6px',
            boxShadow: state.isFocused
              ? '0 0 0 1px #073A55'
              : error
                ? '0 0 0 1px #dc2626'
                : 'none',
            '&:hover': {
              border: '1px solid #073A55',
            },
          }),
          option: (provided, state) => ({
            ...provided,
            backgroundColor: state.isSelected
              ? '#073A55'
              : state.isFocused
                ? '#f3f4f6'
                : 'transparent',
            color: state.isSelected ? 'white' : '#374151',
            '&:hover': {
              backgroundColor: state.isSelected ? '#073A55' : '#f3f4f6',
            },
          }),
          menu: (provided) => ({
            ...provided,
            zIndex: 99999,
          }),
          multiValue: (provided) => ({
            ...provided,
            backgroundColor: '#073A55',
            color: 'white',
          }),
          multiValueLabel: (provided) => ({
            ...provided,
            color: 'white',
          }),
          multiValueRemove: (provided) => ({
            ...provided,
            color: 'white',
            '&:hover': {
              backgroundColor: '#dc2626',
              color: 'white',
            },
          }),
        }}
        filterOption={(option, inputValue) => {
          if (!inputValue) return true
          return (
            option.label.toLowerCase().includes(inputValue.toLowerCase()) ||
            option.value.toLowerCase().includes(inputValue.toLowerCase())
          )
        }}
        formatOptionLabel={(option, { context }) => {
          // Custom option rendering
          if (context === 'menu') {
            return (
              <div className="flex items-center space-x-2">
                {option.data?.icon && (
                  <span className="text-gray-400">{option.data.icon}</span>
                )}
                <span>{option.label}</span>
                {option.data?.description && (
                  <span className="text-xs text-gray-500 ml-auto">
                    {option.data.description}
                  </span>
                )}
              </div>
            )
          }
          return option.label
        }}
      />
    </div>
  )
}
