import React from 'react'
import { FormattedMessage } from 'react-intl'
import { ExtendedRefs, ReferenceType } from '@floating-ui/react'
import { CustomTooltip } from '@remix-ui/helper'

export interface ScamAlertStatusProps {
  refs: ExtendedRefs<ReferenceType>
  getReferenceProps: (userProps?: React.HTMLProps<HTMLElement> | undefined) => Record<string, unknown>
}

export default function ScamAlertStatus ({ refs, getReferenceProps }: ScamAlertStatusProps) {

 return null
}
