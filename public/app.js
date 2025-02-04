import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Clock, User, Briefcase, Mail, Phone, Link } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';

export default function ResearchVisualizer({ jobId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const pollJob = async () => {
      try {
        const response = await fetch(`/research/${jobId}`);
        const result = await response.json();

        if (result.error) {
          setError(result.error);
          setLoading(false);
          return;
        }

        setProgress(result.progress || 0);
        
        if (result.status === 'completed' && result.result) {
          setData(result.result);
          setLoading(false);
        } else if (result.status === 'failed') {
          setError(result.error || 'Research failed');
          setLoading(false);
        } else {
          // Continue polling if job is still running
          setTimeout(pollJob, 2000);
        }
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };

    pollJob();
  }, [jobId]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-4">
              <Clock className="h-5 w-5 text-blue-500 animate-spin" />
              <div className="flex-1">
                <h3 className="font-medium">Research in Progress</h3>
                <Progress value={progress} className="mt-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { contactInfo, professionalInfo, confidence } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Research Results</h2>
        <div className="flex items-center space-x-2">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <span className="text-sm text-gray-500">
            Confidence: {Math.round(confidence * 100)}%
          </span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <User className="h-5 w-5" />
            <span>Contact Information</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {contactInfo.email && (
            <div className="flex items-center space-x-2">
              <Mail className="h-4 w-4 text-gray-500" />
              <span>{contactInfo.email}</span>
            </div>
          )}
          {contactInfo.phone && (
            <div className="flex items-center space-x-2">
              <Phone className="h-4 w-4 text-gray-500" />
              <span>{contactInfo.phone}</span>
            </div>
          )}
          {contactInfo.social && contactInfo.social.map((link, index) => (
            <div key={index} className="flex items-center space-x-2">
              <Link className="h-4 w-4 text-gray-500" />
              <a href={link} className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer">
                {link}
              </a>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Briefcase className="h-5 w-5" />
            <span>Professional Information</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium">Current Role</h4>
            <p>{professionalInfo.currentRole}</p>
            {professionalInfo.company && (
              <p className="text-gray-500">{professionalInfo.company}</p>
            )}
          </div>

          {professionalInfo.experience && professionalInfo.experience.length > 0 && (
            <div>
              <h4 className="font-medium">Experience</h4>
              <ul className="list-disc pl-5 space-y-1">
                {professionalInfo.experience.map((exp, index) => (
                  <li key={index}>{exp}</li>
                ))}
              </ul>
            </div>
          )}

          {professionalInfo.skills && professionalInfo.skills.length > 0 && (
            <div>
              <h4 className="font-medium">Skills</h4>
              <div className="flex flex-wrap gap-2 mt-2">
                {professionalInfo.skills.map((skill, index) => (
                  <span key={index} className="px-2 py-1 bg-gray-100 rounded-full text-sm">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}