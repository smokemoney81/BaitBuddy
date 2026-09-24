import React, { useState, useEffect } from 'react';
import { events } from '@/api/frontendClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Mail, CheckCircle2, XCircle, Loader2, Bell } from 'lucide-react';

export default function EventInvitationsWidget() {
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    loadInvitations();
    const interval = setInterval(loadInvitations, 30000); // Alle 30 Sekunden aktualisieren
    return () => clearInterval(interval);
  }, []);

  const loadInvitations = async () => {
    try {
      const data = await events.myInvitations();
      setInvitations(data || []);
    } catch (error) {
      console.error('Fehler beim Laden von Einladungen:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (invitationId) => {
    try {
      setProcessingId(invitationId);
      await events.acceptInvitation(invitationId);
      toast.success('Einladung akzeptiert! Du bist dem Event beigetreten.');
      await loadInvitations();
    } catch (error) {
      console.error('Fehler beim Akzeptieren der Einladung:', error);
      toast.error('Fehler beim Akzeptieren der Einladung');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (invitationId) => {
    try {
      setProcessingId(invitationId);
      await events.declineInvitation(invitationId);
      toast.success('Einladung abgelehnt');
      await loadInvitations();
    } catch (error) {
      console.error('Fehler beim Ablehnen der Einladung:', error);
      toast.error('Fehler beim Ablehnen der Einladung');
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return null;
  }

  if (!invitations.length) {
    return null;
  }

  return (
    <Card className="glass-morphism border-purple-600/30 bg-gradient-to-br from-purple-900/10 to-pink-900/10 mb-6">
      <CardHeader>
        <CardTitle className="text-purple-400 flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Event-Einladungen ({invitations.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {invitations.map((invitation) => (
          <div
            key={invitation.id}
            className="p-4 rounded-lg bg-purple-900/20 border border-purple-600/30 space-y-3"
          >
            <div>
              <p className="text-white font-semibold">{invitation.events?.name}</p>
              <p className="text-sm text-purple-300 mt-1">
                <Mail className="w-3 h-3 inline mr-1" />
                Von: {invitation.inviter?.name || 'Unbekannt'}
              </p>
            </div>
            {invitation.events?.description && (
              <p className="text-sm text-gray-300">{invitation.events.description}</p>
            )}
            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => handleAccept(invitation.id)}
                disabled={processingId === invitation.id}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm"
              >
                {processingId === invitation.id ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                    Wird akzeptiert...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3 h-3 mr-2" />
                    Akzeptieren
                  </>
                )}
              </Button>
              <Button
                onClick={() => handleDecline(invitation.id)}
                disabled={processingId === invitation.id}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm"
              >
                {processingId === invitation.id ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                    Wird abgelehnt...
                  </>
                ) : (
                  <>
                    <XCircle className="w-3 h-3 mr-2" />
                    Ablehnen
                  </>
                )}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
