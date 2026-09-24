import React from 'react';
import PageTitle from '@/components/layout/PageTitle';

export default function SubPageHeader({ title, icon, iconColor, subtitle, rightAction }) {
  return <PageTitle title={title} subtitle={subtitle} icon={icon} iconColor={iconColor} rightAction={rightAction} />;
}
