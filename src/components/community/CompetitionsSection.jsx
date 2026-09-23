import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Users, Heart, TrendingUp, Info } from 'lucide-react';
import CompetitionLauncher from './CompetitionLauncher';
import VotingEventCard from './VotingEventCard';
import RewardsInfo from './RewardsInfo';

const PointsExplanation = () => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6 }}
    className="bg-gradient-to-br from-blue-900/30 to-cyan-900/20 rounded-2xl border border-cyan-500/30 p-6 mb-8"
  >
    <div className="flex items-center gap-3 mb-4">
      <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
        <Info className="w-5 h-5 text-cyan-400" />
      </div>
      <h3 className="text-lg font-bold text-white">Wie funktionieren Punkte?</h3>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[
        {
          title: "Fang einreichen",
          desc: "Reiche deine Fänge in Wettbewerben ein",
          points: "+100 Basispunkte",
          color: "from-cyan-500/20 to-blue-500/20",
          border: "border-cyan-500/30"
        },
        {
          title: "Längenbonis",
          desc: "Je größer der Fisch, desto mehr Punkte",
          points: "+5 pro cm",
          color: "from-blue-500/20 to-indigo-500/20",
          border: "border-blue-500/30"
        },
        {
          title: "Community-Likes",
          desc: "Erhalte Likes von anderen Usern",
          points: "+1 pro Like",
          color: "from-purple-500/20 to-pink-500/20",
          border: "border-purple-500/30"
        },
        {
          title: "Platzierungsboni",
          desc: "1. Platz: +500 | 2. Platz: +300 | 3. Platz: +100",
          points: "Exklusiv",
          color: "from-amber-500/20 to-orange-500/20",
          border: "border-amber-500/30"
        },
      ].map((item, idx) => (
        <motion.div
          key={idx}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: idx * 0.1 }}
          className={`bg-gradient-to-br ${item.color} border ${item.border} rounded-lg p-4`}
        >
          <div className="flex items-start justify-between mb-2">
            <h4 className="text-sm font-bold text-white">{item.title}</h4>
            <span className="text-xs font-bold text-green-400">{item.points}</span>
          </div>
          <p className="text-xs text-gray-300">{item.desc}</p>
        </motion.div>
      ))}
    </div>

    <div className="mt-4 pt-4 border-t border-cyan-500/20">
      <p className="text-xs text-gray-400">
        Tipp: Nutze die Ranking-Saison, um Premium-Zugang zu gewinnen!
      </p>
    </div>
  </motion.div>
);

const CompetitionTypeCard = ({ type: _type, title, icon: Icon, description, count, color }) => (
  <motion.div
    whileHover={{ y: -4, borderColor: color.border }}
    className={`bg-gradient-to-br ${color.bg} border ${color.border} rounded-xl p-4 cursor-pointer transition`}
  >
    <div className="flex items-start justify-between mb-3">
      <div className={`w-10 h-10 rounded-lg ${color.icon} flex items-center justify-center`}>
        <Icon className="w-5 h-5" style={{ color: color.text }} />
      </div>
      {count > 0 && (
        <span className="px-2 py-1 bg-white/10 text-xs font-bold rounded text-white">
          {count} aktiv
        </span>
      )}
    </div>
    <h3 className="font-bold text-white mb-1">{title}</h3>
    <p className="text-xs text-gray-400">{description}</p>
  </motion.div>
);

export default function CompetitionsSection({
  currentUser,
  recentActivity,
  votingCompetitions,
  teamCompetitions,
  eventCompetitions,
  onCompetitionUpdated
}) {
  const [_expandedSection, _setExpandedSection] = useState(null);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Points Explanation */}
      <PointsExplanation />

      {/* Rewards Info */}
      <RewardsInfo />

      {/* Competition Types Overview */}
      <motion.div variants={itemVariants}>
        <h2 className="text-2xl font-bold text-white mb-4">Wettbewerbsarten</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CompetitionTypeCard
            type="voting"
            title="Abstimmungs-Events"
            icon={Heart}
            description="Zeige deine besten Fangfotos und erhalte Community-Votes"
            count={votingCompetitions?.length || 0}
            color={{
              bg: "from-purple-900/20 to-pink-900/20",
              border: "border-purple-500/30",
              icon: "bg-purple-500/20",
              text: "#A855F7"
            }}
          />
          <CompetitionTypeCard
            type="team"
            title="Team-Wettbewerbe"
            icon={Users}
            description="Trete mit deinem Clan gegen andere Teams an"
            count={teamCompetitions?.length || 0}
            color={{
              bg: "from-green-900/20 to-emerald-900/20",
              border: "border-green-500/30",
              icon: "bg-green-500/20",
              text: "#22C55E"
            }}
          />
          <CompetitionTypeCard
            type="leaderboard"
            title="Ranglisten"
            icon={TrendingUp}
            description="Verfolgde deine Position im monatlichen Ranking"
            count={0}
            color={{
              bg: "from-amber-900/20 to-orange-900/20",
              border: "border-amber-500/30",
              icon: "bg-amber-500/20",
              text: "#FBBF24"
            }}
          />
        </div>
      </motion.div>

      {/* Competition Launcher */}
      <motion.div variants={itemVariants} className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Wettbewerb starten</h2>
        <CompetitionLauncher
          currentUser={currentUser}
          onStarted={onCompetitionUpdated}
        />
      </motion.div>

      {/* Recent Activity */}
      {recentActivity && recentActivity.length > 0 && (
        <motion.div variants={itemVariants}>
          <h2 className="text-2xl font-bold text-white mb-4">Aktuelle Aktivitäten</h2>
          <div className="space-y-3">
            {recentActivity.map((activity, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-4 hover:border-slate-600/70 transition"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                    <Trophy className="w-6 h-6 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white text-sm mb-1">{activity.title}</h3>
                    <p className="text-xs text-gray-400">
                      {activity.competition_type === 'photo_contest' && 'Community Voting'}
                      {activity.competition_type === 'most_catches' && 'Team Wettbewerb'}
                      {activity.competition_type === 'biggest_catch' && 'Größter Fang'}
                      {activity.competition_type === 'specific_species' && `Spezies: ${activity.target_species || 'Alle'}`}
                      {' • '}
                      bis {new Date(activity.end_date).toLocaleDateString('de-DE')}
                    </p>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 text-sm font-semibold rounded-lg transition whitespace-nowrap"
                  >
                    Details
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Voting Competitions */}
      {votingCompetitions && votingCompetitions.length > 0 && (
        <motion.div variants={itemVariants}>
          <h2 className="text-2xl font-bold text-white mb-4">Community-Abstimmungen</h2>
          <div className="space-y-4">
            {votingCompetitions.map((comp) => (
              <VotingEventCard
                key={comp.id}
                competition={comp}
                currentUser={currentUser}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* Empty State */}
      {!eventCompetitions?.length && !votingCompetitions?.length && !teamCompetitions?.length && !recentActivity?.length && (
        <motion.div
          variants={itemVariants}
          className="text-center py-12"
        >
          <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mx-auto mb-4">
            <Trophy className="w-8 h-8 text-slate-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-300 mb-2">Keine aktiven Wettbewerbe</h3>
          <p className="text-gray-500 text-sm">Starten Sie einen Wettbewerb oder warten Sie auf neue Veranstaltungen</p>
        </motion.div>
      )}
    </motion.div>
  );
}
